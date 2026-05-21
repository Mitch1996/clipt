import { NonRetriableError } from "inngest";

import { signAttribution } from "@/lib/attribution/sign";
import {
  SourceDownloadError,
  UnsupportedSourceError,
  downloadSource,
} from "@/features/clips/server/downloadSource";
import { createAdminClient } from "@/lib/supabase/admin";
import { callReframe, callTranscribe } from "@/lib/workers/videoWorker";

import { ClipRequested, inngest } from "../client";

/**
 * processClip — the canonical clip-production pipeline.
 *
 * Triggered by `clip/requested` with `{ clipId }`. Pipeline stages:
 *
 *   1. Load clip from DB
 *   2. Mark processing
 *   3. Download source video                          → Prompt 1.7 ✓
 *   4. Resolve source creator (link clip → channel)
 *   5. Generate captions                              → Prompt 1.9 (stub today)
 *   6. Sign attribution JWT                           → Prompt 1.11 ✓
 *   7. Reframe to vertical (embeds the JWT)           → Prompt 1.10 (stub today)
 *   8. Mark ready
 *
 * The order matters: signing happens BEFORE reframe so the worker can
 * embed the attribution JWT into the mp4 via ffmpeg's
 * `-metadata clipt_attribution=<jwt>` flag.
 *
 * Errors:
 *   - `UnsupportedSourceError` (Twitch VOD, YouTube) — phase scoping;
 *     mark `failed` with the user-facing message and DON'T retry.
 *   - `SourceDownloadError` — supported source but the fetch failed
 *     (deleted clip, CDN hiccup). Mark `failed` and DON'T retry.
 *   - Any other error — let Inngest retry per the function's `retries`
 *     setting; we'll see it in the dev UI's timeline.
 */
export const processClip = inngest.createFunction(
  {
    id: "process-clip",
    retries: 2,
    triggers: [ClipRequested],
  },
  async ({ event, step }) => {
    const { clipId } = event.data;
    const supabase = createAdminClient();

    // 1. Load clip
    const clip = await step.run("load-clip", async () => {
      const { data, error } = await supabase
        .from("clips")
        .select(
          "id, status, source_url, source_platform, source_kind, source_channel_id, source_creator_profile_id, video_r2_key, duration_seconds, source_width, source_height",
        )
        .eq("id", clipId)
        .single();
      if (error || !data) throw new Error(`clip ${clipId} not found`);
      return data;
    });

    // Live-source clips (auto-detected via hype moment + fan-tap-to-clip)
    // have the source pre-stitched into S3 by the live worker (see
    // liveHypeMoment + createLiveClip + workers/live jobs/stitch-live-window).
    // For those rows we skip the URL download + creator-resolve steps;
    // both fields are already set on the row.
    const isPreStitched =
      (clip.source_kind === "live_auto" || clip.source_kind === "live_fan") &&
      !!clip.video_r2_key;

    // 2. Mark processing. We also stamp processing_step so the UI can
    //    show "Downloading source video..." instead of a generic
    //    "processing". Each major phase below updates this string before
    //    the long-running call so the dashboard reflects reality.
    await step.run("mark-processing", async () => {
      const { error } = await supabase
        .from("clips")
        .update({
          status: "processing",
          processing_step: "downloading-source",
          processing_error: null,
        })
        .eq("id", clipId);
      if (error) throw error;
    });

    // 3. Download. UnsupportedSourceError + SourceDownloadError are
    //    *terminal* — fail the row immediately and stop the run.
    //    live_auto skips the network fetch: the live worker already
    //    wrote the source mp4 to S3 + stamped video_r2_key / duration
    //    on the row.
    let downloaded: {
      videoR2Key: string;
      durationSeconds: number;
      originalWidth: number | null;
      originalHeight: number | null;
      title?: string | null;
      sourceCreator: {
        platformUserId: string;
        platformUsername?: string;
        platformLogin?: string;
      } | null;
    };
    if (isPreStitched) {
      downloaded = {
        videoR2Key: clip.video_r2_key!,
        durationSeconds: clip.duration_seconds ?? 0,
        originalWidth: clip.source_width,
        originalHeight: clip.source_height,
        sourceCreator: null,
      };
    } else {
      try {
        downloaded = await step.run("download-source", () =>
          downloadSource(clipId, clip.source_url ?? ""),
        );
      } catch (err) {
        const isTerminal =
          err instanceof Error &&
          (err.name === "UnsupportedSourceError" ||
            err.name === "SourceDownloadError" ||
            err instanceof UnsupportedSourceError ||
            err instanceof SourceDownloadError);

        if (isTerminal) {
          const message = err instanceof Error ? err.message : String(err);
          await step.run("mark-failed", async () => {
            await supabase
              .from("clips")
              .update({
                status: "failed",
                processing_step: null,
                processing_error: message,
              })
              .eq("id", clipId);
          });
          throw new NonRetriableError(message);
        }
        throw err;
      }

      await step.run("persist-source-meta", async () => {
        const { error } = await supabase
          .from("clips")
          .update({
            video_r2_key: downloaded.videoR2Key,
            duration_seconds: downloaded.durationSeconds,
            source_width: downloaded.originalWidth,
            source_height: downloaded.originalHeight,
          })
          .eq("id", clipId);
        if (error) throw error;
      });
    }

    // 4. Resolve source-creator profile via the channels table. If the
    //    streamer has connected their channel to Clipt we link the clip
    //    to their profile; otherwise leave both fields null and revisit
    //    if they connect later.
    //
    //    live_auto + live_fan already have source_channel_id +
    //    source_creator_profile_id set by liveHypeMoment / createLiveClip
    //    (it's literally the channel that fired the hype event / the
    //    channel the fan tapped on), so we skip this step too.
    const resolved = isPreStitched
      ? {
          channelId: clip.source_channel_id,
          profileId: clip.source_creator_profile_id,
        }
      : await step.run("resolve-source-creator", async () => {
          if (!downloaded.sourceCreator) {
            return { channelId: null, profileId: null };
          }
          const { data } = await supabase
            .from("channels")
            .select("id, owner_id")
            .eq("platform", clip.source_platform!)
            .eq("platform_user_id", downloaded.sourceCreator.platformUserId)
            .maybeSingle();
          return {
            channelId: data?.id ?? null,
            profileId: data?.owner_id ?? null,
          };
        });

    if (!isPreStitched) {
      // Always overwrite, even when both are null — the JWT carries the
      // resolved values, so the row must match (avoids a stale value
      // surviving from createClipFromUrl).
      await step.run("persist-source-creator", async () => {
        const { error } = await supabase
          .from("clips")
          .update({
            source_channel_id: resolved.channelId,
            source_creator_profile_id: resolved.profileId,
          })
          .eq("id", clipId);
        if (error) throw error;
      });
    }

    // 5. Transcribe via worker (stub today — real Whisper in Prompt 1.9).
    await step.run("mark-transcribing", async () => {
      const { error } = await supabase
        .from("clips")
        .update({ processing_step: "transcribing" })
        .eq("id", clipId);
      if (error) throw error;
    });
    const transcribed = await step.run("transcribe", () =>
      callTranscribe({
        clipId,
        sourceR2Key: downloaded.videoR2Key,
      }),
    );

    await step.run("persist-captions", async () => {
      const { error } = await supabase
        .from("clips")
        .update({
          captions_json: transcribed.captionsJson as never,
        })
        .eq("id", clipId);
      if (error) throw error;
    });

    // 6. Sign attribution. The token is the cryptographic proof of
    //    origin — source channel + creator + URL + cut window — and is
    //    persisted on the row AND embedded in the mp4 metadata by
    //    reframe.
    const attributionToken = await step.run("sign-attribution", () =>
      signAttribution({
        clipId,
        sourceChannelId: resolved.channelId,
        originalCreatorProfileId: resolved.profileId,
        sourcePlatform: clip.source_platform ?? "unknown",
        sourceUrl: clip.source_url ?? "",
        sourceStartSec: 0,
        sourceEndSec: downloaded.durationSeconds ?? 0,
        issuedAt: new Date().toISOString(),
      }),
    );

    await step.run("persist-attribution", async () => {
      const { error } = await supabase
        .from("clips")
        .update({ attribution_signature: attributionToken })
        .eq("id", clipId);
      if (error) throw error;
    });

    // 7. Reframe (real MediaPipe + ffmpeg). Pass the attribution token
    //    so the worker can ffmpeg it into `-metadata clipt_attribution=<jwt>`.
    await step.run("mark-reframing", async () => {
      const { error } = await supabase
        .from("clips")
        .update({ processing_step: "reframing" })
        .eq("id", clipId);
      if (error) throw error;
    });

    // Channel-set face-cam corner override. Undefined => worker
    // auto-detects via clustering; set value => skips detection and
    // crops the standard rectangle in the named corner.
    const faceCamCorner = await step.run("load-face-cam-corner", async () => {
      if (!resolved.channelId) return null;
      const { data } = await supabase
        .from("channels")
        .select("face_cam_corner")
        .eq("id", resolved.channelId)
        .maybeSingle();
      return data?.face_cam_corner ?? null;
    });

    const reframed = await step.run("reframe", () =>
      callReframe({
        clipId,
        sourceR2Key: downloaded.videoR2Key,
        captionsR2Key: transcribed.captionsR2Key,
        style: "default",
        creatorHandle: downloaded.sourceCreator?.platformLogin,
        attributionToken,
        faceCamCorner: (faceCamCorner ?? undefined) as
          | "top_left" | "top_right" | "bottom_left" | "bottom_right"
          | undefined,
      }),
    );

    // Cache the auto-detected cam corner back to the channel if we
    // don't already have one stored. Face cams are fixed in OBS, so
    // the first successful detection should win for every subsequent
    // clip on the same channel — eliminates the "detection wobble"
    // where two clips a minute apart pick different regions.
    if (
      resolved.channelId &&
      !faceCamCorner &&
      reframed.detectedCorner
    ) {
      await step.run("cache-face-cam-corner", async () => {
        await supabase
          .from("channels")
          .update({ face_cam_corner: reframed.detectedCorner })
          .eq("id", resolved.channelId!)
          .is("face_cam_corner", null); // never overwrite a manual override
      });
    }

    await step.run("persist-reframe-meta", async () => {
      const { error } = await supabase
        .from("clips")
        .update({
          vertical_video_r2_key: reframed.verticalR2Key,
        })
        .eq("id", clipId);
      if (error) throw error;
    });

    // 8. Mark ready — clear processing_step so the UI flips off the
    //    progress label.
    await step.run("mark-ready", async () => {
      const { error } = await supabase
        .from("clips")
        .update({
          status: "ready",
          processing_step: null,
          processing_error: null,
        })
        .eq("id", clipId);
      if (error) throw error;
    });

    return { clipId, status: "ready", source_url: clip.source_url };
  },
);

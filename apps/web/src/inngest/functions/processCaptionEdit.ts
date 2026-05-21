import { NonRetriableError } from "inngest";

import { createAdminClient } from "@/lib/supabase/admin";
import { callDetectFaceCam, callReframe } from "@/lib/workers/videoWorker";

import { ClipCaptionsUpdated, inngest } from "../client";

/**
 * processCaptionEdit — re-renders the vertical mp4 with edited captions.
 *
 * Triggered by `clip/captions-updated` after the editor saves new
 * caption text. We skip transcription (the segments come straight from
 * the editor) and reuse the existing attribution JWT from the row, so
 * the cut-window and signing identity stay stable across edits.
 *
 * Flow:
 *   1. Load the clip + captions + attribution + source-creator handle
 *   2. Mark `processing` (UI shows skeleton over the preview)
 *   3. Call worker reframe with the new captions key
 *   4. Persist updated vertical R2 key (usually the same key, overwritten)
 *   5. Mark `ready`
 */
export const processCaptionEdit = inngest.createFunction(
  {
    id: "process-caption-edit",
    retries: 2,
    triggers: [ClipCaptionsUpdated],
  },
  async ({ event, step }) => {
    const { clipId } = event.data;
    const supabase = createAdminClient();

    const clip = await step.run("load-clip", async () => {
      const { data, error } = await supabase
        .from("clips")
        .select(
          "id, video_r2_key, attribution_signature, source_creator_profile_id, source_channel_id",
        )
        .eq("id", clipId)
        .maybeSingle();
      if (error || !data) {
        throw new NonRetriableError(`clip ${clipId} not found`);
      }
      if (!data.video_r2_key) {
        throw new NonRetriableError(
          `clip ${clipId} has no source video — caption edit not applicable`,
        );
      }
      return data;
    });

    // Resolve handle for the burned-in badge — same lookup process-clip
    // does on the original render. step.run results round-trip through
    // JSON, so we return `null` (not `undefined`, which JSON drops)
    // and narrow at the call site.
    const creatorHandle: string | null = await step.run(
      "load-creator-handle",
      async () => {
        if (!clip.source_creator_profile_id) return null;
        const { data } = await supabase
          .from("profiles")
          .select("handle")
          .eq("id", clip.source_creator_profile_id)
          .maybeSingle();
        return data?.handle ?? null;
      },
    );

    await step.run("mark-processing", async () => {
      const { error } = await supabase
        .from("clips")
        .update({
          status: "processing",
          processing_step: "reframing",
          processing_error: null,
        })
        .eq("id", clipId);
      if (error) throw error;
    });

    let faceCamCorner = await step.run("load-face-cam-corner", async () => {
      if (!clip.source_channel_id) return null;
      const { data } = await supabase
        .from("channels")
        .select("face_cam_corner")
        .eq("id", clip.source_channel_id)
        .maybeSingle();
      return data?.face_cam_corner ?? null;
    });
    if (!faceCamCorner && clip.source_channel_id) {
      const detected = await step.run("detect-face-cam-vision", async () => {
        try {
          const res = await callDetectFaceCam({
            sourceR2Key: clip.video_r2_key!,
          });
          return res.corner ?? null;
        } catch (err) {
          console.warn("detect-face-cam failed:", err);
          return null;
        }
      });
      if (detected) {
        faceCamCorner = detected;
        await step.run("cache-vision-corner", async () => {
          await supabase
            .from("channels")
            .update({ face_cam_corner: detected })
            .eq("id", clip.source_channel_id!)
            .is("face_cam_corner", null);
        });
      }
    }

    const reframed = await step.run("reframe", () =>
      callReframe({
        clipId,
        sourceR2Key: clip.video_r2_key!,
        captionsR2Key: `captions/${clipId}.json`,
        style: "default",
        creatorHandle: creatorHandle ?? undefined,
        attributionToken: clip.attribution_signature ?? undefined,
        faceCamCorner: (faceCamCorner ?? undefined) as
          | "top_left" | "top_right" | "bottom_left" | "bottom_right"
          | undefined,
      }),
    );

    // Cache auto-detected corner back to the channel if not overridden.
    if (
      clip.source_channel_id &&
      !faceCamCorner &&
      reframed.detectedCorner
    ) {
      await step.run("cache-face-cam-corner", async () => {
        await supabase
          .from("channels")
          .update({ face_cam_corner: reframed.detectedCorner })
          .eq("id", clip.source_channel_id!)
          .is("face_cam_corner", null);
      });
    }

    await step.run("persist-vertical", async () => {
      const { error } = await supabase
        .from("clips")
        .update({ vertical_video_r2_key: reframed.verticalR2Key })
        .eq("id", clipId);
      if (error) throw error;
    });

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

    return { clipId, status: "ready" };
  },
);

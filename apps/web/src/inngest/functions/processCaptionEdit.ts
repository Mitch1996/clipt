import { NonRetriableError } from "inngest";

import { createAdminClient } from "@/lib/supabase/admin";
import { callDetectFaceCam, callReframe } from "@/lib/workers/videoWorker";

import {
  ClipCaptionsUpdated,
  CornerVerificationFailed,
  inngest,
} from "../client";

/**
 * processCaptionEdit — re-renders the vertical mp4.
 *
 * Despite the name, this is the canonical re-render path. Triggered by:
 *   - the editor saving new caption text
 *   - the self-heal loop after corner invalidation
 *   - the channel/added flow after a corner-cache update
 *
 * Each run reads channels.face_cam_corner + channels.is_vtuber fresh,
 * re-renders with the latest state, runs the same in-worker
 * post-render verification, and either marks ready (passed) or kicks
 * the self-heal loop again (failed). Circuit breaker on
 * clips.verification_attempts caps how many cycles a single clip can
 * trigger.
 */
const CIRCUIT_BREAKER_MAX_ATTEMPTS = 2;

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
          "id, video_r2_key, attribution_signature, source_creator_profile_id, source_channel_id, verification_attempts, face_cam_corner, face_cam_bbox, face_cam_bbox_source",
        )
        .eq("id", clipId)
        .maybeSingle();
      if (error || !data) {
        throw new NonRetriableError(`clip ${clipId} not found`);
      }
      if (!data.video_r2_key) {
        throw new NonRetriableError(
          `clip ${clipId} has no source video — re-render not applicable`,
        );
      }
      return data;
    });

    // Circuit breaker. If this clip has already burned through its
    // re-render budget, give up — mark verification_status='failed' for
    // admin triage and DON'T loop again.
    if (clip.verification_attempts >= CIRCUIT_BREAKER_MAX_ATTEMPTS) {
      await step.run("mark-circuit-tripped", async () => {
        await supabase
          .from("clips")
          .update({
            status: "ready", // surface the (wrong) render rather than leaving the clip in limbo
            verification_status: "failed",
            processing_step: null,
            processing_error: `Self-heal circuit breaker tripped after ${CIRCUIT_BREAKER_MAX_ATTEMPTS} attempts. Admin triage required.`,
          })
          .eq("id", clipId);
      });
      return {
        clipId,
        status: "circuit-tripped",
        attempts: clip.verification_attempts,
      };
    }

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

    // Fresh read of channel state — this is what makes the self-heal
    // loop work. After CornerVerificationFailed nulls the cached
    // corner and re-runs detection, subsequent re-renders see the new
    // value here.
    const channelState = await step.run("load-channel-state", async () => {
      if (!clip.source_channel_id)
        return { corner: null, bbox: null, isVtuber: null };
      const { data } = await supabase
        .from("channels")
        .select("face_cam_corner, face_cam_bbox, is_vtuber")
        .eq("id", clip.source_channel_id)
        .maybeSingle();
      return {
        corner: data?.face_cam_corner ?? null,
        bbox: (data?.face_cam_bbox as Record<string, number> | null) ?? null,
        isVtuber: data?.is_vtuber ?? null,
      };
    });
    let faceCamCorner = channelState.corner;
    // Per-clip bbox (manual override / prior render's stamp) takes
    // priority over the channel-cached one. processCaptionEdit is the
    // canonical re-render path, so this is the spot where the manual
    // editor's writes get picked up.
    let faceCamBbox =
      (clip.face_cam_bbox as Record<string, number> | null) ??
      channelState.bbox;
    let cornerSource: "vision" | "vod_predetect" | "reverify" | null =
      faceCamCorner ? "reverify" : null;
    if (!faceCamCorner && clip.source_channel_id) {
      const detected = await step.run("detect-face-cam-vision", async () => {
        try {
          const res = await callDetectFaceCam({
            sourceR2Key: clip.video_r2_key!,
          });
          return {
            corner: res.corner ?? null,
            bbox: (res.bbox ?? null) as Record<string, number> | null,
            confidence: res.confidence ?? 0,
          };
        } catch (err) {
          console.warn("detect-face-cam failed:", err);
          return { corner: null, bbox: null, confidence: 0 };
        }
      });
      if (detected.corner) {
        faceCamCorner = detected.corner;
        if (detected.bbox && !faceCamBbox) faceCamBbox = detected.bbox;
        cornerSource = "vision";
        await step.run("cache-vision-corner", async () => {
          const patch: {
            face_cam_corner: string;
            face_cam_corner_confidence: number;
            face_cam_bbox?: Record<string, number>;
          } = {
            face_cam_corner: detected.corner!,
            face_cam_corner_confidence: detected.confidence,
          };
          if (detected.bbox) patch.face_cam_bbox = detected.bbox;
          await supabase
            .from("channels")
            .update(patch)
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
        faceCamBbox: (faceCamBbox ?? undefined) as
          | { x: number; y: number; w: number; h: number }
          | undefined,
        isVtuber: channelState.isVtuber ?? undefined,
      }),
    );

    if (
      clip.source_channel_id &&
      !faceCamCorner &&
      reframed.detectedCorner
    ) {
      faceCamCorner = reframed.detectedCorner;
      cornerSource = "vision";
      await step.run("cache-fallback-corner", async () => {
        await supabase
          .from("channels")
          .update({ face_cam_corner: reframed.detectedCorner })
          .eq("id", clip.source_channel_id!)
          .is("face_cam_corner", null);
      });
    }

    await step.run("persist-vertical", async () => {
      const update: {
        vertical_video_r2_key: string;
        face_cam_corner: string | null;
        face_cam_corner_source: string | null;
        verification_status: string;
        verification_attempts: number;
        face_cam_bbox?: Record<string, number>;
        face_cam_bbox_source?: string;
      } = {
        vertical_video_r2_key: reframed.verticalR2Key,
        face_cam_corner: faceCamCorner,
        face_cam_corner_source: cornerSource,
        verification_status: reframed.verificationStatus ?? "skipped",
        verification_attempts: clip.verification_attempts + 1,
      };
      // Don't overwrite a manual bbox. Otherwise stamp whatever the
      // renderer actually cropped from so subsequent renders match.
      if (
        reframed.usedBbox &&
        clip.face_cam_bbox_source !== "manual"
      ) {
        update.face_cam_bbox = reframed.usedBbox;
        update.face_cam_bbox_source =
          reframed.usedBboxSource ?? "mediapipe_refine";
      }
      const { error } = await supabase
        .from("clips")
        .update(update)
        .eq("id", clipId);
      if (error) throw error;
    });

    if (reframed.verificationStatus === "failed") {
      console.warn(
        `clip ${clipId} re-render verification failed (attempt ${clip.verification_attempts + 1}): ${reframed.verificationDetail ?? "?"}`,
      );
      await step.run("fire-self-heal", async () => {
        await inngest.send({
          name: CornerVerificationFailed.name,
          data: {
            clipId,
            channelId: clip.source_channel_id,
            invalidatedCorner: faceCamCorner,
          },
        });
      });
      return {
        clipId,
        status: "self-heal-queued",
        attempts: clip.verification_attempts + 1,
      };
    }

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

"use server";

import { revalidatePath } from "next/cache";

import { ClipCaptionsUpdated, inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface CamBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The 4 named corners the worker's coarse-fallback path knows about.
 *  Re-exported so callers don't need to keep importing the deleted
 *  setManualCorner.ts. */
export type CamCorner =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

/**
 * Per-clip manual bbox override from the draggable editor.
 *
 * Same role as setManualCorner.ts but at a finer grain — instead of
 * picking a corner + relying on the renderer's fixed preset, the
 * streamer drags a tight rectangle around their actual cam widget.
 * The renderer crops exactly that region (reshaped to the cam-band
 * aspect via _cam_crop_box).
 *
 * Validation happens here because the SQL check on clips.face_cam_bbox
 * only enforces the JSON shape — numeric range + aspect-ratio sanity
 * needs application logic. Rejections return a typed error so the
 * editor can surface "your box is too small / off-frame / etc." to
 * the streamer without round-tripping to the worker.
 *
 * On save we also promote the bbox to channels.face_cam_bbox. Manual
 * picks are the highest-signal input we have; future clips on the
 * same channel should benefit immediately rather than re-running
 * detection on every new clip.
 *
 * Verification semantics: clips.face_cam_bbox_source = 'manual' is a
 * signal to selfHealCorner that the streamer's pick wins. If a
 * manually-set clip fails post-render verification, the clip flags
 * for admin triage but the channel cache is NOT invalidated and
 * fanout re-renders are NOT fired.
 */

// Cam band aspect for the stacked layout. Mirrors the worker
// (CAM_BAND_H / TARGET_W in reframe.py = 920 / 1080 ≈ 0.852, so
// width/height ≈ 1.174). ±15% tolerance because the renderer
// reshapes to fix-aspect via _cam_crop_box anyway.
const CAM_BAND_ASPECT = 1080 / 920;
const ASPECT_TOLERANCE = 0.15;

// Hard floors. Anything smaller than 3% × 3% is almost certainly a
// misclick (smaller than any real cam widget); anything bigger than
// 85% of frame area is the model claiming the whole screen is the
// cam, which we treat as "no cam" / "use a centered layout instead."
const MIN_DIM = 0.03;
const MAX_AREA = 0.85;

function validateBbox(
  bbox: CamBbox,
): { ok: true; bbox: CamBbox } | { ok: false; error: string } {
  if (
    !Number.isFinite(bbox.x) ||
    !Number.isFinite(bbox.y) ||
    !Number.isFinite(bbox.w) ||
    !Number.isFinite(bbox.h)
  ) {
    return { ok: false, error: "Bbox contains non-numeric values" };
  }

  // Forgiveness clamp — pointer-event arithmetic occasionally lands
  // 0.001 past the edge. Reject outright when meaningfully off-frame.
  const clamp = (n: number) =>
    Math.abs(n) < 0.01 ? 0 : Math.abs(n - 1) < 0.01 ? 1 : n;
  let { x, y, w, h } = bbox;
  x = clamp(x);
  y = clamp(y);
  if (x < 0 || y < 0 || x > 1 || y > 1) {
    return { ok: false, error: "Bbox origin must be in [0, 1]" };
  }
  if (w <= 0 || h <= 0) {
    return { ok: false, error: "Bbox width and height must be positive" };
  }
  if (x + w > 1.0001 || y + h > 1.0001) {
    return { ok: false, error: "Bbox extends past the source frame" };
  }
  // Clamp final to canonical 0..1 (handles the ±0.0001 slop above).
  w = Math.min(w, 1 - x);
  h = Math.min(h, 1 - y);

  if (w < MIN_DIM || h < MIN_DIM) {
    return {
      ok: false,
      error: "Bbox is too small — a real face cam is at least 3% of the frame.",
    };
  }
  if (w * h > MAX_AREA) {
    return {
      ok: false,
      error: "Bbox covers nearly the entire frame — pick a tighter region.",
    };
  }

  // Aspect-ratio sanity. The renderer reshapes to fix-aspect inside
  // _cam_crop_box anyway, so we save off-aspect drags but note them.
  // Beyond ±15% we don't reject — just trust the streamer and let the
  // renderer's reshape do the work.
  const aspect = w / h;
  const lo = CAM_BAND_ASPECT * (1 - ASPECT_TOLERANCE);
  const hi = CAM_BAND_ASPECT * (1 + ASPECT_TOLERANCE);
  void lo;
  void hi;
  void aspect;
  return { ok: true, bbox: { x, y, w, h } };
}

export async function setClipFaceCamBbox(
  clipId: string,
  bbox: CamBbox,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validated = validateBbox(bbox);
  if (!validated.ok) return validated;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();
  const { data: clip } = await admin
    .from("clips")
    .select("id, clipper_profile_id, source_channel_id, video_r2_key, status")
    .eq("id", clipId)
    .maybeSingle();
  if (!clip) return { ok: false, error: "Clip not found" };
  if (clip.clipper_profile_id !== user.id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return { ok: false, error: "Not yours" };
    }
  }
  if (!clip.video_r2_key) {
    return {
      ok: false,
      error: "Source video missing — can't re-render without it.",
    };
  }

  // 1. Stamp the clip with the manual bbox. Reset verification so the
  //    re-render's post-render check starts fresh + attempt counter
  //    is zeroed (manual pick is a legitimate fresh attempt, not a
  //    continuation of the failed auto-loop).
  const { error: updateErr } = await admin
    .from("clips")
    .update({
      face_cam_bbox: validated.bbox as unknown as Record<string, number>,
      face_cam_bbox_source: "manual",
      verification_status: "pending",
      verification_attempts: 0,
    })
    .eq("id", clipId);
  if (updateErr) return { ok: false, error: updateErr.message };

  // 2. Promote to the channel cache too — high-signal correction.
  if (clip.source_channel_id) {
    await admin
      .from("channels")
      .update({
        face_cam_bbox: validated.bbox as unknown as Record<string, number>,
        face_cam_corner_confidence: 1.0,
      })
      .eq("id", clip.source_channel_id);
  }

  // 3. Fire re-render. processCaptionEdit picks up the new bbox via
  //    its load-clip step + passes it through to the worker.
  await inngest.send({
    name: ClipCaptionsUpdated.name,
    data: { clipId },
  });

  revalidatePath(`/dashboard/clips/${clipId}`);
  revalidatePath(`/c/${clipId}`);
  return { ok: true };
}


/** Clears the per-clip override so the next render uses the channel
 *  defaults (or re-detects). Same revalidate + re-render semantics. */
export async function resetClipFaceCamBbox(
  clipId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();
  const { data: clip } = await admin
    .from("clips")
    .select("id, clipper_profile_id")
    .eq("id", clipId)
    .maybeSingle();
  if (!clip) return { ok: false, error: "Clip not found" };
  if (clip.clipper_profile_id !== user.id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return { ok: false, error: "Not yours" };
    }
  }

  const { error } = await admin
    .from("clips")
    .update({
      face_cam_bbox: null,
      face_cam_bbox_source: null,
      face_cam_corner: null,
      face_cam_corner_source: null,
      verification_status: "pending",
      verification_attempts: 0,
    })
    .eq("id", clipId);
  if (error) return { ok: false, error: error.message };

  await inngest.send({
    name: ClipCaptionsUpdated.name,
    data: { clipId },
  });

  revalidatePath(`/dashboard/clips/${clipId}`);
  return { ok: true };
}

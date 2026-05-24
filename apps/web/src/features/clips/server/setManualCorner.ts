"use server";

import { revalidatePath } from "next/cache";

import { ClipCaptionsUpdated, inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CamCorner =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

const VALID: ReadonlyArray<CamCorner> = [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
];

/**
 * Per-clip manual cam-corner override.
 *
 * Sets clips.face_cam_corner directly + tags the source as 'manual'
 * so the self-heal loop won't override it later. Also writes the
 * value back to channels.face_cam_corner so subsequent clips on
 * the same channel benefit from the user's correction (the user's
 * pick is high-confidence signal we'd be silly to ignore).
 *
 * Then fires clip/captions-updated, which triggers processCaptionEdit
 * → re-render with the new corner. The re-render's own post-render
 * verification runs as normal; if it fails on a manually-picked
 * corner we still flag it for admin triage rather than silently
 * overriding the user.
 */
export async function setClipFaceCamCorner(
  clipId: string,
  corner: CamCorner,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!VALID.includes(corner)) {
    return { ok: false, error: "Invalid corner" };
  }

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
    // Admins can override anyone's clip too.
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

  // 1. Stamp clip with the manual corner. Resets verification so the
  //    re-render's post-render check starts fresh + attempt counter
  //    is zeroed (a manual pick is a legitimate retry, not a
  //    continuation of the failed auto-loop).
  const { error: updateErr } = await admin
    .from("clips")
    .update({
      face_cam_corner: corner,
      face_cam_corner_source: "manual",
      verification_status: "pending",
      verification_attempts: 0,
    })
    .eq("id", clipId);
  if (updateErr) return { ok: false, error: updateErr.message };

  // 2. Promote to the channel cache too — high-signal correction.
  //    Only overwrites if the existing cached value differs, to
  //    avoid spurious updated_at churn.
  if (clip.source_channel_id) {
    await admin
      .from("channels")
      .update({
        face_cam_corner: corner,
        face_cam_corner_confidence: 1.0, // manual = 100% confidence
      })
      .eq("id", clip.source_channel_id)
      .neq("face_cam_corner", corner);
  }

  // 3. Fire re-render. processCaptionEdit reads channels.face_cam_corner
  //    fresh and now sees the new value.
  await inngest.send({
    name: ClipCaptionsUpdated.name,
    data: { clipId },
  });

  revalidatePath(`/dashboard/clips/${clipId}`);
  revalidatePath(`/c/${clipId}`);
  return { ok: true };
}

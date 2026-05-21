"use server";

import { revalidatePath } from "next/cache";

import { ChannelAdded, inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FaceCamCorner =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right"
  | null;

const VALID_CORNERS: ReadonlyArray<Exclude<FaceCamCorner, null>> = [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
];

export async function setFaceCamCorner(
  channelId: string,
  corner: FaceCamCorner,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (corner !== null && !VALID_CORNERS.includes(corner)) {
    return { ok: false, error: "Invalid corner value" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Use admin client + explicit owner check rather than relying on
  // RLS — the channels update policy currently scopes to owner, and we
  // want a consistent error message for "not yours".
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("channels")
    .select("owner_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Channel not found" };
  if (row.owner_id !== user.id) return { ok: false, error: "Not yours" };

  const { error } = await admin
    .from("channels")
    .update({ face_cam_corner: corner })
    .eq("id", channelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/channels");
  revalidatePath("/dashboard/admin/watch");
  return { ok: true };
}

/**
 * Re-run VOD-based vision detection for a channel. Used by the admin
 * re-detect button on /dashboard/admin/watch when an initial auto-pick
 * was wrong, or when the streamer rearranged their layout. Clears the
 * existing corner first so detectChannelCorner doesn't short-circuit
 * on the "already set" guard.
 */
export async function redetectFaceCamCorner(
  channelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: row } = await admin
    .from("channels")
    .select("id, platform, platform_user_id, platform_username, owner_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Channel not found" };

  // Admins can re-detect any row (watch-only); owners can re-detect
  // their own.
  const isAdmin = profile?.role === "admin";
  if (!isAdmin && row.owner_id !== user.id) {
    return { ok: false, error: "Not yours" };
  }

  if (row.platform !== "twitch") {
    return { ok: false, error: "VOD detection is Twitch-only for now" };
  }
  if (!row.platform_user_id) {
    return { ok: false, error: "Channel is missing platform_user_id" };
  }

  // Clear the cached corner so detectChannelCorner proceeds (it bails
  // when face_cam_corner is already set).
  const { error: clearErr } = await admin
    .from("channels")
    .update({ face_cam_corner: null })
    .eq("id", channelId);
  if (clearErr) return { ok: false, error: clearErr.message };

  try {
    await inngest.send({
      name: ChannelAdded.name,
      data: {
        channelId,
        platform: "twitch",
        platformUserId: row.platform_user_id,
        platformLogin: row.platform_username ?? "",
      },
    });
  } catch (exc) {
    return {
      ok: false,
      error: `Couldn't enqueue detection: ${(exc as Error).message}`,
    };
  }

  revalidatePath("/dashboard/channels");
  revalidatePath("/dashboard/admin/watch");
  return { ok: true };
}

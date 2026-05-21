"use server";

import { revalidatePath } from "next/cache";

import { ChannelAdded, ClipCaptionsUpdated, inngest } from "@/inngest/client";
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

/**
 * How many of the channel's most-recent ready clips to auto re-render
 * when their corner cache changes. Channel-level corner is OBS-fixed,
 * so older clips would be wrong with the previous corner; we re-render
 * a sliding window of the latest so the user sees existing clips
 * catch up with the new pick.
 */
const RECENT_CLIPS_TO_RERENDER = 5;

async function fireRerenderForRecentClips(
  channelId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  // processCaptionEdit reads channels.face_cam_corner fresh on each
  // run, then re-renders with the existing captions + attribution
  // signature on the row. So firing clip/captions-updated against a
  // ready clip is exactly "re-render this clip with the latest channel
  // settings" without needing a dedicated event.
  const { data: rows, error } = await admin
    .from("clips")
    .select("id")
    .eq("source_channel_id", channelId)
    .eq("status", "ready")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_CLIPS_TO_RERENDER);
  if (error || !rows?.length) return 0;
  let fired = 0;
  for (const row of rows) {
    try {
      await inngest.send({
        name: ClipCaptionsUpdated.name,
        data: { clipId: row.id },
      });
      fired += 1;
    } catch (exc) {
      console.warn("inngest re-render send failed:", exc);
    }
  }
  return fired;
}

export async function setFaceCamCorner(
  channelId: string,
  corner: FaceCamCorner,
): Promise<{ ok: true; rerendered: number } | { ok: false; error: string }> {
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
    .select("owner_id, face_cam_corner")
    .eq("id", channelId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Channel not found" };
  if (row.owner_id !== user.id) return { ok: false, error: "Not yours" };

  const { error } = await admin
    .from("channels")
    .update({ face_cam_corner: corner })
    .eq("id", channelId);
  if (error) return { ok: false, error: error.message };

  // If the corner actually changed (not just re-saving the same value),
  // re-render the channel's most recent ready clips so existing renders
  // catch up to the new cam region.
  let rerendered = 0;
  if (corner !== row.face_cam_corner && corner !== null) {
    rerendered = await fireRerenderForRecentClips(channelId, admin);
  }

  revalidatePath("/dashboard/channels");
  revalidatePath("/dashboard/admin/watch");
  return { ok: true, rerendered };
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

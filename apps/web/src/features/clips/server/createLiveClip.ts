"use server";

import { randomUUID } from "node:crypto";

import { inngest } from "@/inngest/client";
import { canCreateClip } from "@/lib/billing/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { callStitchLiveWindow } from "@/lib/workers/videoWorker";

/**
 * createLiveClip — fan-driven "clip the last N seconds" surface.
 *
 * Called by the `/live/[platform]/[login]` page when the viewer taps
 * the big floating button. The channel must be currently live AND
 * connected to Clipt (so we have an ingestor buffering segments).
 *
 * Pipeline:
 *   1. Resolve the channel row by (platform, platform_username).
 *   2. Refuse if the channel isn't currently live (is_live = false).
 *   3. Compute the window: now - lookbackSec to now.
 *   4. Ask the live worker to stitch the segment range into
 *      sources/{newClipId}.mp4.
 *   5. Insert clips row with status='pending', source_kind='live_fan',
 *      clipper = current user, source_creator = channel.owner_id.
 *   6. Fire `clip/requested` so the normal pipeline transcribes,
 *      reframes + signs attribution.
 *
 * Returns the new clip id so the caller can redirect to the editor.
 */

export type CreateLiveClipInput = {
  platform: "twitch" | "youtube" | "kick";
  channelLogin: string;
  lookbackSec?: number;
};

export type CreateLiveClipResult =
  | { ok: true; clipId: string }
  | { ok: false; error: string };

export async function createLiveClip(
  input: CreateLiveClipInput,
): Promise<CreateLiveClipResult> {
  if (input.platform !== "twitch") {
    return {
      ok: false,
      error: "Live fan clipping only supports Twitch in V1 — YouTube + Kick coming soon.",
    };
  }

  const lookbackSec = Math.max(5, Math.min(60, input.lookbackSec ?? 30));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Free-tier monthly clip cap — same gate as the paste-URL flow.
  const gate = await canCreateClip(user.id);
  if (!gate.ok) {
    return {
      ok: false,
      error: `You've hit the free-tier limit of ${gate.limit} clips this month. Upgrade to Creator for unlimited clips.`,
    };
  }

  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("id, owner_id, platform, platform_username, is_live, last_live_check")
    .eq("platform", input.platform)
    .ilike("platform_username", input.channelLogin)
    .maybeSingle();

  if (!channel) {
    return {
      ok: false,
      error: `@${input.channelLogin} isn't connected to Clipt yet — only connected channels have a live buffer.`,
    };
  }
  if (!channel.is_live) {
    return {
      ok: false,
      error: `@${input.channelLogin} isn't streaming right now. The live buffer only exists during a live broadcast.`,
    };
  }

  const newClipId = randomUUID();
  const nowMs = Date.now();
  const windowStartMs = nowMs - lookbackSec * 1000;

  let stitched;
  try {
    stitched = await callStitchLiveWindow({
      channelId: channel.id,
      channelLogin: channel.platform_username ?? input.channelLogin,
      windowStartMs,
      windowEndMs: nowMs,
      newClipId,
    });
  } catch (err) {
    return {
      ok: false,
      error: `Stitch failed: ${(err as Error).message}`,
    };
  }

  const { error: insertErr } = await admin.from("clips").insert({
    id: newClipId,
    status: "pending",
    source_kind: "live_fan",
    source_platform: input.platform,
    source_channel_id: channel.id,
    source_creator_profile_id: channel.owner_id,
    clipper_profile_id: user.id,
    video_r2_key: stitched.sourceR2Key,
    // clips.duration_seconds is an integer column; ffprobe gives us
    // sub-second precision we don't need.
    duration_seconds: Math.round(stitched.durationSec),
    title: `Live clip from @${channel.platform_username ?? input.channelLogin}`,
  });
  if (insertErr) {
    return { ok: false, error: `Clip insert failed: ${insertErr.message}` };
  }

  await inngest.send({
    name: "clip/requested",
    data: { clipId: newClipId },
  });

  return { ok: true, clipId: newClipId };
}

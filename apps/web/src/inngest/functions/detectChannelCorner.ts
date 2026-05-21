import { NonRetriableError } from "inngest";

import { resolveLatestTwitchVod } from "@/features/channels/server/twitchVod";
import { createAdminClient } from "@/lib/supabase/admin";
import { callDetectFaceCam } from "@/lib/workers/videoWorker";

import { ChannelAdded, ClipCaptionsUpdated, inngest } from "../client";

/** Keep in sync with RECENT_CLIPS_TO_RERENDER in setFaceCamCorner.ts —
 * the manual + auto corner-update paths should re-render the same
 * sliding window of recent clips. */
const RECENT_CLIPS_TO_RERENDER = 5;

/**
 * detectChannelCorner — pre-fills channels.face_cam_corner the moment
 * we know about the channel, before the streamer ever cuts a clip.
 *
 * Triggered by `channel/added` (fired from addWatchOnlyChannel and
 * the Twitch OAuth callback). Flow:
 *   1. Bail if the row already has a corner set (manual override, or
 *      we ran this previously and got a confident result).
 *   2. Resolve the streamer's latest Twitch VOD HLS playlist.
 *   3. Call the worker's /jobs/detect-face-cam with the HLS URL — it
 *      ffmpegs 4 frames at spaced offsets (60s/300s/600s/1800s, clamped
 *      to the VOD length) and runs gpt-4o-mini vision on them.
 *   4. Write the corner back to the channel row, but only when
 *      face_cam_corner is still null (never clobber a manual pick).
 *
 * Failure modes (all soft — we always recover by falling back to
 * per-clip detection in processClip / processCaptionEdit):
 *   - Twitch user has no public VODs (sub-only, brand-new, expired):
 *     leave the row alone, the per-clip path will try again with the
 *     actual clip source.
 *   - Vision returns "none" (centred talking-head, no game): store
 *     null, which trips per-clip detection too — vision will see the
 *     same when looking at the clip, just from a different angle.
 *   - Worker / OpenAI 5xx: let Inngest retry per the function's
 *     `retries` setting.
 */
export const detectChannelCorner = inngest.createFunction(
  {
    id: "detect-channel-corner",
    retries: 2,
    triggers: [ChannelAdded],
  },
  async ({ event, step }) => {
    const { channelId, platform, platformUserId } = event.data;
    if (platform !== "twitch") {
      // YouTube/Kick VOD resolution lands when those platforms ship —
      // for now we only auto-detect Twitch channels.
      return { skipped: "non-twitch platform" };
    }
    const supabase = createAdminClient();

    const channel = await step.run("load-channel", async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, face_cam_corner, platform_username")
        .eq("id", channelId)
        .maybeSingle();
      if (error || !data) {
        throw new NonRetriableError(`channel ${channelId} not found`);
      }
      return data;
    });

    if (channel.face_cam_corner) {
      return { skipped: "corner already set", corner: channel.face_cam_corner };
    }

    const vod = await step.run("resolve-twitch-vod", async () => {
      try {
        return await resolveLatestTwitchVod(platformUserId);
      } catch (err) {
        // Twitch API hiccup — let Inngest retry by re-throwing
        // (resolveLatestTwitchVod returns null for "no VODs available",
        // it only throws for true HTTP/auth failures).
        throw err;
      }
    });

    if (!vod) {
      // No public VOD — per-clip fallback will handle them on first
      // clip. Not a failure, just nothing we can pre-detect from.
      return { skipped: "no public VOD", channelId };
    }

    // Pick sample offsets bounded by the VOD's duration. Spread across
    // the broadcast so we see varied gameplay states.
    const offsets = [60, 300, 600, 1800]
      .filter((o) => o < vod.durationSec - 30)
      .slice(0, 4);
    // Always give the model at least one frame near the start.
    if (offsets.length === 0) offsets.push(Math.max(5, vod.durationSec / 2));

    const detected = await step.run("detect-face-cam-vision", async () => {
      try {
        const res = await callDetectFaceCam({
          sourceUrl: vod.hlsUrl,
          sampleOffsetsSec: offsets,
        });
        return {
          corner: res.corner ?? null,
          framesSampled: res.framesSampled ?? 0,
        };
      } catch (err) {
        console.warn("detect-face-cam (vod) failed:", err);
        return { corner: null, framesSampled: 0 };
      }
    });

    if (!detected.corner) {
      return {
        skipped: "vision returned no corner",
        framesSampled: detected.framesSampled,
        vodId: vod.vodId,
      };
    }

    await step.run("persist-corner", async () => {
      await supabase
        .from("channels")
        .update({ face_cam_corner: detected.corner })
        .eq("id", channelId)
        .is("face_cam_corner", null); // never overwrite a manual override
    });

    // Re-render the channel's most recent ready clips with the new
    // corner. processCaptionEdit reads face_cam_corner fresh on each
    // run, so this catches existing clips up without a dedicated event.
    const rerendered = await step.run("rerender-recent-clips", async () => {
      const { data: rows } = await supabase
        .from("clips")
        .select("id")
        .eq("source_channel_id", channelId)
        .eq("status", "ready")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(RECENT_CLIPS_TO_RERENDER);
      let fired = 0;
      for (const row of rows ?? []) {
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
    });

    return {
      channelId,
      corner: detected.corner,
      framesSampled: detected.framesSampled,
      vodId: vod.vodId,
      rerendered,
    };
  },
);

import { NonRetriableError } from "inngest";

import { resolveLatestTwitchVod } from "@/features/channels/server/twitchVod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  callClassifyVtuber,
  callDetectFaceCam,
} from "@/lib/workers/videoWorker";

import { ChannelAdded, ClipCaptionsUpdated, inngest } from "../client";

/** Keep in sync with RECENT_CLIPS_TO_RERENDER everywhere this is
 * fanned out — see the self-heal loop on verification failure. */
const RECENT_CLIPS_TO_RERENDER = 5;

/**
 * detectChannelCorner — pre-fills channels.face_cam_corner and
 * channels.is_vtuber the moment we know about the channel.
 *
 * Triggered by `channel/added` (fired from addWatchOnlyChannel and the
 * Twitch OAuth callback). Both classification steps run in parallel on
 * the same VOD HLS URL:
 *
 *   - 7-sample consensus corner detection (≥4 votes agreeing). Anything
 *     less is treated as "no signal" and the channel's corner stays
 *     null so per-clip detection retries on real clip frames.
 *   - 7-sample consensus VTuber classification (human vs avatar vs
 *     none). Caches to channels.is_vtuber; drives which post-render
 *     verification path runs (MediaPipe for humans, vision for VTubers).
 *
 * Failure modes (all soft):
 *   - No public VOD (sub-only / brand new): nothing cached, per-clip
 *     fallback handles first clip
 *   - Consensus not reached: don't cache a low-confidence guess, retry
 *     next clip
 *   - Worker / OpenAI 5xx: Inngest retries per `retries` setting
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
      return { skipped: "non-twitch platform" };
    }
    const supabase = createAdminClient();

    const channel = await step.run("load-channel", async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, face_cam_corner, is_vtuber, platform_username")
        .eq("id", channelId)
        .maybeSingle();
      if (error || !data) {
        throw new NonRetriableError(`channel ${channelId} not found`);
      }
      return data;
    });

    if (channel.face_cam_corner && channel.is_vtuber !== null) {
      return {
        skipped: "corner + vtuber both already set",
        corner: channel.face_cam_corner,
        isVtuber: channel.is_vtuber,
      };
    }

    const vod = await step.run("resolve-twitch-vod", async () => {
      return await resolveLatestTwitchVod(platformUserId);
    });

    if (!vod) {
      return { skipped: "no public VOD", channelId };
    }

    // Sample offsets bounded by VOD duration. We use the worker's
    // defaults when the VOD is long enough; otherwise we squeeze the
    // window. Both endpoints accept the same offset list.
    const offsets = [60, 180, 300, 600, 1200, 1800, 2700]
      .filter((o) => o < vod.durationSec - 30)
      .slice(0, 7);
    if (offsets.length === 0) {
      offsets.push(Math.max(5, vod.durationSec / 2));
    }

    // ─── 1. Consensus corner detection ──────────────────────────────
    const detected = await step.run("detect-face-cam-vision", async () => {
      if (channel.face_cam_corner) {
        // Already set (manual or prior detection); skip the call.
        return {
          corner: channel.face_cam_corner,
          bbox: null as Record<string, number> | null,
          confidence: 1.0,
          framesSampled: 0,
          votes: {},
        };
      }
      try {
        const res = await callDetectFaceCam({
          sourceUrl: vod.hlsUrl,
          sampleOffsetsSec: offsets,
        });
        return {
          corner: res.corner ?? null,
          bbox: (res.bbox ?? null) as Record<string, number> | null,
          framesSampled: res.framesSampled ?? 0,
          confidence: res.confidence ?? 0,
          votes: res.votes ?? {},
        };
      } catch (err) {
        console.warn("detect-face-cam (vod) failed:", err);
        return { corner: null, bbox: null, framesSampled: 0, confidence: 0, votes: {} };
      }
    });

    // ─── 2. VTuber classification ───────────────────────────────────
    const vtuber = await step.run("classify-vtuber", async () => {
      if (channel.is_vtuber !== null) {
        return { isVtuber: channel.is_vtuber, confidence: 1.0, framesSampled: 0 };
      }
      try {
        const res = await callClassifyVtuber({
          sourceUrl: vod.hlsUrl,
          sampleOffsetsSec: offsets,
        });
        return {
          isVtuber: res.isVtuber,
          confidence: res.confidence ?? 0,
          framesSampled: res.framesSampled ?? 0,
        };
      } catch (err) {
        console.warn("classify-vtuber (vod) failed:", err);
        return { isVtuber: null, confidence: 0, framesSampled: 0 };
      }
    });

    // ─── 3. Persist whatever we learned ─────────────────────────────
    await step.run("persist-channel-state", async () => {
      const patch: {
        face_cam_corner?: string;
        face_cam_corner_confidence?: number;
        face_cam_bbox?: Record<string, number>;
        is_vtuber?: boolean;
      } = {};
      // Never clobber an existing corner — guards against a race where
      // two detection runs land at once. The bbox piggybacks on the
      // same write (only persisted when we just learned the corner).
      if (detected.corner && !channel.face_cam_corner) {
        patch.face_cam_corner = detected.corner;
        patch.face_cam_corner_confidence = detected.confidence;
        if (detected.bbox) {
          patch.face_cam_bbox = detected.bbox;
        }
      }
      if (vtuber.isVtuber !== null && channel.is_vtuber === null) {
        patch.is_vtuber = vtuber.isVtuber;
      }
      if (Object.keys(patch).length === 0) return;
      await supabase.from("channels").update(patch).eq("id", channelId);
    });

    // ─── 4. Re-render recent clips if the corner changed ────────────
    const rerendered = detected.corner
      ? await step.run("rerender-recent-clips", async () => {
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
        })
      : 0;

    return {
      channelId,
      corner: detected.corner,
      cornerVotes: detected.votes,
      cornerConfidence: detected.confidence,
      isVtuber: vtuber.isVtuber,
      vtuberConfidence: vtuber.confidence,
      framesSampled: Math.max(detected.framesSampled, vtuber.framesSampled),
      vodId: vod.vodId,
      rerendered,
    };
  },
);

import { NonRetriableError } from "inngest";

import { resolveLatestTwitchVod } from "@/features/channels/server/twitchVod";
import { createAdminClient } from "@/lib/supabase/admin";
import { callDetectFaceCam } from "@/lib/workers/videoWorker";

import {
  ClipCaptionsUpdated,
  CornerVerificationFailed,
  inngest,
} from "../client";

/**
 * selfHealCorner — react to `corner/verification-failed`.
 *
 * Flow:
 *   1. Null the channel's cached corner (the one that produced the
 *      bad render).
 *   2. Re-run consensus detection on fresh VOD frames. Cache the new
 *      corner if it meets the consensus floor.
 *   3. Fan out re-render events for every clip on this channel that
 *      was rendered with the now-invalidated corner AND hasn't already
 *      burned through its circuit-breaker budget (≤ 2 attempts) AND
 *      is from the last 30 days.
 *
 * The picker is gone; this loop is the only correction path. If it
 * runs out of attempts on a clip, that clip's verification_status
 * flips to 'failed' and it surfaces in the admin triage dashboard.
 */

/** How far back to look when invalidating renders. Older clips are
 *  unlikely to still be actively shared and re-rendering hundreds of
 *  months-old clips would waste budget. Configurable via env var to
 *  override per-deploy. */
const FANOUT_DAYS_DEFAULT = 30;

function fanoutDays(): number {
  const env = process.env.CORNER_SELFHEAL_FANOUT_DAYS;
  const n = env ? Number(env) : NaN;
  return Number.isFinite(n) && n > 0 ? n : FANOUT_DAYS_DEFAULT;
}

export const selfHealCorner = inngest.createFunction(
  {
    id: "self-heal-corner",
    retries: 2,
    triggers: [CornerVerificationFailed],
  },
  async ({ event, step }) => {
    const { clipId, channelId, invalidatedCorner } = event.data;
    if (!channelId) {
      return { skipped: "no channel attached to clip", clipId };
    }
    const supabase = createAdminClient();

    const channel = await step.run("load-channel", async () => {
      const { data, error } = await supabase
        .from("channels")
        .select(
          "id, platform, platform_user_id, platform_username, face_cam_corner",
        )
        .eq("id", channelId)
        .maybeSingle();
      if (error || !data) {
        throw new NonRetriableError(`channel ${channelId} not found`);
      }
      return data;
    });

    // Was the failing clip rendered from a manual override? If so,
    // the streamer's pick wins — we don't invalidate the channel
    // cache or fan out re-renders that would override their
    // selection. Instead we just stamp verification_status='failed'
    // on this single clip so it surfaces in admin triage. Lets us
    // catch genuine "manual pick is wrong" cases without the loop
    // unilaterally overriding the human.
    const triggerClip = await step.run("load-trigger-clip", async () => {
      const { data } = await supabase
        .from("clips")
        .select("face_cam_bbox_source")
        .eq("id", clipId)
        .maybeSingle();
      return data;
    });
    if (triggerClip?.face_cam_bbox_source === "manual") {
      await step.run("mark-manual-failed-for-triage", async () => {
        await supabase
          .from("clips")
          .update({ verification_status: "failed" })
          .eq("id", clipId);
      });
      return {
        clipId,
        channelId,
        skipped: "manual override — flagged for admin triage instead",
      };
    }

    // Guard against duplicate self-heal runs racing each other. If
    // the cache has already been replaced with a different corner
    // since the event was fired, someone else's re-detect won; we
    // just need to ensure the affected clips get re-rendered.
    if (
      channel.face_cam_corner &&
      channel.face_cam_corner !== invalidatedCorner
    ) {
      // The cache has already advanced — skip the null + re-detect
      // steps but still fire fanout in case more clips need to catch
      // up.
    } else if (invalidatedCorner) {
      await step.run("invalidate-channel-corner-and-bbox", async () => {
        // Null BOTH the corner and the bbox. The corner was wrong, so
        // the bbox derived from it is also suspect; leaving the bbox
        // would keep the next render anchored to the bad region.
        await supabase
          .from("channels")
          .update({
            face_cam_corner: null,
            face_cam_corner_confidence: null,
            face_cam_bbox: null,
          })
          .eq("id", channelId)
          .eq("face_cam_corner", invalidatedCorner); // CAS-style: only clear if unchanged
      });

      // Re-run consensus detection from fresh VOD frames. Prefer the
      // streamer's latest VOD because it has more variety than a
      // single 30-second clip — better odds the consensus floor is
      // reached.
      const reverified = await step.run("re-detect-from-vod", async () => {
        if (channel.platform !== "twitch") {
          return { corner: null, bbox: null, confidence: 0 };
        }
        try {
          const vod = await resolveLatestTwitchVod(channel.platform_user_id);
          if (!vod) return { corner: null, bbox: null, confidence: 0 };
          const offsets = [60, 180, 300, 600, 1200, 1800, 2700]
            .filter((o) => o < vod.durationSec - 30)
            .slice(0, 7);
          if (offsets.length === 0) {
            offsets.push(Math.max(5, vod.durationSec / 2));
          }
          const res = await callDetectFaceCam({
            sourceUrl: vod.hlsUrl,
            sampleOffsetsSec: offsets,
          });
          return {
            corner: res.corner ?? null,
            bbox: (res.bbox ?? null) as Record<string, number> | null,
            confidence: res.confidence ?? 0,
          };
        } catch (err) {
          console.warn("self-heal: re-detect failed:", err);
          return { corner: null, bbox: null, confidence: 0 };
        }
      });

      // Persist the re-detected corner + bbox IF the consensus floor
      // was met AND the corner is different from the invalidated one
      // (a re-detect that produces the same wrong answer means the
      // source can't disambiguate; we leave null + let per-clip
      // detection retry on each clip's own frames).
      if (
        reverified.corner &&
        reverified.corner !== invalidatedCorner
      ) {
        await step.run("persist-reverified-state", async () => {
          const patch: {
            face_cam_corner: string;
            face_cam_corner_confidence: number;
            face_cam_bbox?: Record<string, number>;
          } = {
            face_cam_corner: reverified.corner!,
            face_cam_corner_confidence: reverified.confidence,
          };
          if (reverified.bbox) {
            patch.face_cam_bbox = reverified.bbox;
          }
          await supabase
            .from("channels")
            .update(patch)
            .eq("id", channelId)
            .is("face_cam_corner", null);
        });
      }
    }

    // Fan out re-renders. Targets every clip that:
    //   - is on this channel
    //   - was rendered with the invalidated corner (so we don't
    //     re-render clips that already use the right one)
    //   - is within the configurable lookback window
    //   - hasn't exhausted its circuit-breaker budget
    //   - is not soft-deleted
    const fanned = await step.run("fanout-rerenders", async () => {
      const cutoffIso = new Date(
        Date.now() - fanoutDays() * 24 * 60 * 60 * 1000,
      ).toISOString();
      let q = supabase
        .from("clips")
        .select("id, verification_attempts, face_cam_corner")
        .eq("source_channel_id", channelId)
        .is("deleted_at", null)
        .lt("verification_attempts", 2)
        .gte("created_at", cutoffIso);
      // Only target clips with the invalidated corner; null
      // (pre-migration) clips can be filtered IN too because they
      // probably have the bug.
      if (invalidatedCorner) {
        q = q.or(
          `face_cam_corner.eq.${invalidatedCorner},face_cam_corner.is.null`,
        );
      }
      const { data: rows, error } = await q;
      if (error) throw error;
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
      return { fired, totalCandidates: rows?.length ?? 0 };
    });

    return {
      clipId,
      channelId,
      invalidatedCorner,
      ...fanned,
    };
  },
);

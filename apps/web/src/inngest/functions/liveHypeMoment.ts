import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { callStitchLiveWindow } from "@/lib/workers/videoWorker";

import { ClipHypeMoment, ClipRequested, inngest } from "../client";

/**
 * liveHypeMoment — turns a hype moment (chat spike or keyword cluster
 * fired by the live worker's spike detector) into a candidate clip.
 *
 * Pipeline:
 *   1. Sleep ~12s so the +5s post-window segments land in S3, with a
 *      small safety margin for the playlist-poll latency.
 *   2. Look up the channel + its owner profile.
 *   3. Ask the live worker to stitch every `live/{channelId}/*.ts`
 *      segment between detectedAt-25s and detectedAt+5s into
 *      `sources/{newClipId}.mp4`.
 *   4. Insert the clips row with status='processing',
 *      source_kind='live_auto', source_creator + clipper both set to
 *      the channel owner (auto-clip from their own stream).
 *   5. Fire `clip/requested` so the normal `processClip` pipeline
 *      transcribes + reframes + signs attribution.
 *
 * Errors at any step mark the row failed if it was already inserted;
 * before that, the function just throws and Inngest retries once.
 */
const PRE_WINDOW_MS = 25_000; // 25 seconds before the spike
const POST_WINDOW_MS = 5_000; //  5 seconds after the spike
const SETTLE_DELAY = "12s"; // wait for the +5s segments to land

export const liveHypeMoment = inngest.createFunction(
  {
    id: "live-hype-moment",
    retries: 1,
    triggers: [ClipHypeMoment],
  },
  async ({ event, step }) => {
    const { channelId, channelLogin, detectedAt, score, reason, stats } =
      event.data;
    const supabase = createAdminClient();

    // 1. Wait for the post-spike segments to actually exist in S3.
    await step.sleep("wait-for-buffer", SETTLE_DELAY);

    // 2. Resolve channel → owner profile (we need a clipper_profile_id
    //    for the clips row's NOT NULL constraint).
    const channel = await step.run("load-channel", async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, owner_id, platform")
        .eq("id", channelId)
        .single();
      if (error || !data) {
        throw new Error(`channel ${channelId} not found`);
      }
      return data;
    });

    if (channel.platform !== "twitch") {
      // V1 only supports Twitch live; YouTube/Kick land in 2.x.
      return { skipped: true, reason: `platform=${channel.platform}` };
    }

    const newClipId = await step.run("generate-clip-id", async () => randomUUID());

    // 3. Stitch the rolling-buffer slab into sources/{newClipId}.mp4.
    const stitched = await step.run("stitch-live-window", () =>
      callStitchLiveWindow({
        channelId,
        channelLogin,
        windowStartMs: detectedAt - PRE_WINDOW_MS,
        windowEndMs: detectedAt + POST_WINDOW_MS,
        newClipId,
      }),
    );

    // 4. Insert the clip row. processClip's existing steps then take
    //    over from `download-source` onward — but for `live_auto`
    //    clips the source is *already* in S3, so we pre-fill
    //    video_r2_key + duration so the download step short-circuits
    //    (existing behavior: if video_r2_key is set on entry, the
    //    download phase skips the network fetch).
    await step.run("insert-clip-row", async () => {
      const { error } = await supabase.from("clips").insert({
        id: newClipId,
        status: "pending",
        source_kind: "live_auto",
        source_platform: "twitch",
        source_channel_id: channelId,
        source_creator_profile_id: channel.owner_id,
        clipper_profile_id: channel.owner_id,
        video_r2_key: stitched.sourceR2Key,
        duration_seconds: stitched.durationSec,
        title: `Live clip from @${channelLogin ?? "unknown"} — ${new Date(
          detectedAt,
        )
          .toISOString()
          .slice(11, 19)} UTC`,
      });
      if (error) {
        throw new Error(`clip insert failed: ${error.message}`);
      }
    });

    // 5. Kick the normal pipeline. processClip is idempotent on row
    //    state — it reads `clips` and only re-runs the steps that
    //    haven't already produced output.
    await step.run("fire-clip-requested", async () => {
      await inngest.send({
        name: ClipRequested.name,
        data: { clipId: newClipId },
      });
    });

    return {
      clipId: newClipId,
      sourceR2Key: stitched.sourceR2Key,
      segmentCount: stitched.segmentCount,
      durationSec: stitched.durationSec,
      reason,
      score,
      stats,
    };
  },
);

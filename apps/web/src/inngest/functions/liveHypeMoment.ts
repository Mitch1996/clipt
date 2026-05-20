import { ClipHypeMoment, inngest } from "../client";

/**
 * liveHypeMoment — receives `clip/hype-moment` events fired by the
 * live worker's spike detector and (eventually) turns the surrounding
 * HLS-buffer segments into a candidate clip.
 *
 * V1 (Phase 2.2): just log the event so the operator can verify the
 * pipeline lights up end-to-end. The actual stitch + clip-row insert
 * lands in 2.3, where we'll:
 *
 *   1. List segments under live/{channelId}/ in S3 between
 *      detectedAt-25s and detectedAt+5s.
 *   2. ffmpeg-concat into sources/{newClipId}.mp4 (mirrors the
 *      manual stitch endpoint in workers/live).
 *   3. Insert clips row with status='processing', source_kind='live_auto'.
 *   4. inngest.send('clip/requested', { clipId }) so the normal
 *      processClip pipeline takes over (transcribe + reframe + sign).
 *   5. Notify the channel owner via Realtime + (Phase 3) push
 *      notification.
 */
export const liveHypeMoment = inngest.createFunction(
  {
    id: "live-hype-moment",
    retries: 1,
    triggers: [ClipHypeMoment],
  },
  async ({ event, step }) => {
    const { channelId, channelLogin, detectedAt, score, reason, stats } =
      event.data;

    await step.run("log-event", async () => {
      // Console-only for V1. Phase 2.3 turns this into a clip insert.
      console.log(
        "[live-hype-moment]",
        JSON.stringify({
          channelId,
          channelLogin,
          detectedAt: new Date(detectedAt).toISOString(),
          reason,
          score,
          stats,
        }),
      );
    });

    return { ok: true, channelId, reason, score };
  },
);

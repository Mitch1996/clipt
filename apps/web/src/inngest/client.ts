import { Inngest, eventType, staticSchema } from "inngest";

import type { PublishInput } from "@/features/publishing/schema";

/**
 * Strongly-typed event registry. Define each event Clipt fires here, then
 * import the symbol where you send the event (`inngest.send(...)`) and
 * where you write a function that listens for it.
 *
 * Naming convention: `domain/event-name` (kebab-case after the slash).
 *
 * Inngest 4 dropped `EventSchemas`/`fromRecord<...>()`. The current pattern
 * is `eventType("name", { schema: staticSchema<Payload>() })`. The
 * `staticSchema` is type-only — there's no runtime validation. Wrap with
 * a Zod / Standard Schema if you want validation at the boundary.
 */
export const ClipRequested = eventType("clip/requested", {
  schema: staticSchema<{ clipId: string }>(),
});

export const ClipCaptionsUpdated = eventType("clip/captions-updated", {
  schema: staticSchema<{ clipId: string }>(),
});

/**
 * Fired when the publish UI scheduled a post for a future time. The
 * handler `publishScheduledPost` step.sleepUntils, then runs the
 * platform-specific upload and updates the placeholder clip_posts row.
 */
export const PublishScheduled = eventType("publish/scheduled", {
  schema: staticSchema<{
    postId: string;
    scheduledFor: string;
    input: PublishInput;
  }>(),
});

/**
 * Fired by the live worker (workers/live) when a connected channel's
 * chat spikes or a keyword cluster trips the detector. The handler
 * `liveHypeMoment` will (Phase 2.2+) reach into the segment buffer
 * around `detectedAt`, stitch an mp4, and kick the normal clip
 * pipeline — for now it just logs so we can verify the event flow
 * end-to-end.
 */
export const ClipHypeMoment = eventType("clip/hype-moment", {
  schema: staticSchema<{
    channelId: string;
    channelLogin: string;
    detectedAt: number; // epoch milliseconds
    score: number;
    reason: "chat_spike" | "keyword_cluster";
    stats?: {
      shortMsgPerSec: number;
      baselineMsgPerSec: number;
      keywordHits5s: number;
    };
  }>(),
});

export const inngest = new Inngest({ id: "clipt" });

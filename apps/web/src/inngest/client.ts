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

export const inngest = new Inngest({ id: "clipt" });

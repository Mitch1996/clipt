import { z } from "zod";

export const PUBLISH_PLATFORMS = ["tiktok", "instagram", "youtube_shorts"] as const;
export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number];

export const publishInputSchema = z.object({
  clipId: z.uuid(),
  platform: z.enum(PUBLISH_PLATFORMS),
  caption: z.string().max(2200, "Caption is too long").default(""),
  hashtags: z.array(z.string().regex(/^[A-Za-z0-9_]+$/, "Hashtags must be alphanumeric/underscore")).max(30).default([]),
  /** ISO-8601; absent = post immediately. */
  scheduledFor: z.string().datetime().optional(),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

export interface PublishResult {
  ok: true;
  url: string;
  platformPostId: string | null;
  postId: string;
}

export interface PublishStub {
  ok: false;
  error: string;
  platformConfigured: boolean;
}

export type PublishOutcome = PublishResult | PublishStub;

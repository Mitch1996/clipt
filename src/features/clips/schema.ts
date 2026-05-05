import { z } from "zod";

export const SOURCE_PLATFORMS = ["twitch", "youtube", "kick"] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

export const SOURCE_KINDS = [
  "clip",
  "vod",
  "video",
  "short",
  "live_auto",
  "live_fan",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const pasteUrlSchema = z.object({
  sourceUrl: z
    .string()
    .min(1, "Paste a URL")
    .url("That doesn't look like a URL"),
});

export type PasteUrlInput = z.infer<typeof pasteUrlSchema>;

export const CLIP_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

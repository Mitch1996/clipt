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

export const CLIP_VISIBILITIES = ["public", "unlisted"] as const;
export type ClipVisibility = (typeof CLIP_VISIBILITIES)[number];

/**
 * Caption JSON shape persisted on `clips.captions_json`. The full
 * Whisper output (Prompt 1.9) includes word-level timings; the editor
 * only mutates segment-level `text` so the renderer can find the new
 * sentence breaks while keeping word timings stable.
 */
export const captionSegmentSchema = z.object({
  id: z.union([z.number(), z.string()]),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  words: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
      }),
    )
    .optional(),
});
export type CaptionSegment = z.infer<typeof captionSegmentSchema>;

export const captionsJsonSchema = z.object({
  language: z.string(),
  segments: z.array(captionSegmentSchema),
  stub: z.boolean().optional(),
});
export type CaptionsJson = z.infer<typeof captionsJsonSchema>;

export const updateClipMetaSchema = z.object({
  title: z.string().trim().min(1, "Title can't be empty").max(140).optional(),
  visibility: z.enum(CLIP_VISIBILITIES).optional(),
});
export type UpdateClipMetaInput = z.infer<typeof updateClipMetaSchema>;

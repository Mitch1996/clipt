import { z } from "zod";

export const SEGMENTS = ["streamer", "fan", "clipper", "brand", "other"] as const;
export type WaitlistSegment = (typeof SEGMENTS)[number];

export const waitlistSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("That doesn't look like a valid email"),
  segment: z.enum(SEGMENTS, {
    error: "Pick a segment so we know how to onboard you",
  }),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;

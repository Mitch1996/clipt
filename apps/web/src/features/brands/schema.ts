import { z } from "zod";

/**
 * Single source of truth for marketplace-facing zod schemas. Shared
 * by the create/edit forms (client) and the server actions that
 * consume them.
 */

export const NICHES = [
  "general",
  "gaming",
  "finance",
  "saas",
  "fitness",
  "tech",
  "lifestyle",
  "food",
  "sports",
  "music",
] as const;

export const TIERS = ["bronze", "silver", "gold"] as const;

export const PLATFORMS = ["tiktok", "reels", "shorts", "x"] as const;

/** Hard floors so a brand can't push a campaign for $0.01/1k views. */
const MIN_CPM_CENTS = 50; // $0.50 / 1k views
const MIN_BUDGET_CENTS = 5_000; // $50

// No .default() calls anywhere here. Defaults belong on useForm's
// `defaultValues` so input + output types stay identical; otherwise
// react-hook-form's zodResolver generics mismatch.
export const createCampaignSchema = z.object({
  title: z.string().min(3).max(120),
  brief: z.string().max(8_000),
  // Plain number — the form must register these inputs with
  // `valueAsNumber: true`. We don't use z.coerce here because the
  // unknown→number coercion confuses react-hook-form's resolver.
  budget_cents: z.number().int().min(MIN_BUDGET_CENTS),
  cpm_cents: z.number().int().min(MIN_CPM_CENTS),
  max_per_clip_cents: z.number().int().min(0).nullable(),
  niche: z.enum(NICHES),
  brand_safety_tier: z.enum(TIERS),
  geo: z.array(z.string().min(2).max(8)).max(50),
  languages: z.array(z.string().min(2).max(8)).max(20),
  allowed_platforms: z.array(z.enum(PLATFORMS)).min(1),
  brand_handle: z.string().max(64).nullable(),
  ends_at: z.string().datetime().nullable(),
  source_urls: z.array(z.string().url()).max(20),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;


export const reviewSubmissionSchema = z.object({
  submission_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  notes: z.string().max(2_000).optional(),
});

export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;


export const brandAccessRequestSchema = z.object({
  company_name: z.string().min(2).max(120),
  company_url: z.union([z.string().url(), z.literal("")]),
  intended_use: z.string().min(20).max(2_000),
});

export type BrandAccessRequestInput = z.infer<typeof brandAccessRequestSchema>;

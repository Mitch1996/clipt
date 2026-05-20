/**
 * Plan registry. Single source of truth for what each tier unlocks.
 *
 * `entitlements.ts` reads from here to decide what a profile can do.
 * `BillingPage` renders the table from here. The webhook + Checkout
 * code maps Stripe price IDs back to a tier via `tierForPriceId()`.
 *
 * Pricing currency tracks whichever currency the Stripe products were
 * created in (we're in EUR for now — the labels reflect that). Stripe
 * Checkout enforces the currency on its side; we never charge directly.
 */

export const TIERS = ["free", "creator", "pro"] as const;
export type Tier = (typeof TIERS)[number];

export interface Plan {
  tier: Tier;
  name: string;
  price: string; // human label only — Stripe is the source of truth on the number
  /** null → unlimited */
  monthlyClipLimit: number | null;
  resolution: "720p" | "1080p" | "4K";
  features: string[];
  /** Stripe Price ID — only set for paid tiers. */
  priceEnvVar: "STRIPE_PRICE_CREATOR" | "STRIPE_PRICE_PRO" | null;
}

export const PLANS: Record<Tier, Plan> = {
  free: {
    tier: "free",
    name: "Free",
    price: "€0",
    monthlyClipLimit: 10,
    resolution: "720p",
    features: [
      "10 clips per month",
      "720p export",
      "No watermark",
      "Basic publish (YouTube Shorts)",
    ],
    priceEnvVar: null,
  },
  creator: {
    tier: "creator",
    name: "Creator",
    price: "€9 / mo",
    monthlyClipLimit: null,
    resolution: "1080p",
    features: [
      "Unlimited clips",
      "1080p export",
      "Scheduled posts",
      "All 5 caption languages",
      "Hook detection",
    ],
    priceEnvVar: "STRIPE_PRICE_CREATOR",
  },
  pro: {
    tier: "pro",
    name: "Pro",
    price: "€24 / mo",
    monthlyClipLimit: null,
    resolution: "4K",
    features: [
      "Everything in Creator",
      "4K export",
      "Brand kit",
      "Advanced analytics",
      "Multi-channel switching",
    ],
    priceEnvVar: "STRIPE_PRICE_PRO",
  },
};

/** Resolve a Stripe price ID back to its tier. Returns null if unknown. */
export function tierForPriceId(priceId: string | null | undefined): Tier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_CREATOR) return "creator";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return null;
}

/**
 * Map a Stripe subscription status to the "is this profile entitled to
 * paid features right now" boolean. trialing + active count as paid;
 * past_due is a grace period the dashboard surfaces but still allows.
 */
export function isPaidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === "active" || status === "trialing" || status === "past_due";
}

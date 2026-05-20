import "server-only";

import Stripe from "stripe";

/**
 * Singleton Stripe client. Server-only — `import "server-only"` makes
 * the bundler error if anything in a `"use client"` chain imports this.
 *
 * Pins the API version so a Stripe-side rollout doesn't reshape webhook
 * payloads underneath us. Update intentionally with the changelog open.
 */

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured: set STRIPE_SECRET_KEY in apps/web/.env.local",
    );
  }
  cached = new Stripe(key, {
    // Pinned so a Stripe-side rollout doesn't reshape webhook payloads
    // underneath us. Bump intentionally with the changelog open.
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return cached;
}

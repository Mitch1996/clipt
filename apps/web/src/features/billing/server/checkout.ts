"use server";

import { redirect } from "next/navigation";

import { stripe } from "@/lib/billing/stripe";
import { PLANS, type Tier } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts a Stripe Checkout session for the given paid tier and returns
 * its URL — the client component redirects the browser. We use a server
 * action rather than a route handler so the call is tied to the user's
 * Supabase session cookie automatically.
 *
 * The created/retrieved Stripe customer ID is cached on `profiles` so a
 * second checkout reuses it (and the Billing Portal works).
 */

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function startCheckout(tier: Tier): Promise<CheckoutResult> {
  if (tier === "free") return { ok: false, error: "Free tier does not require checkout" };

  const plan = PLANS[tier];
  const priceEnv = plan.priceEnvVar;
  if (!priceEnv) return { ok: false, error: `Plan ${tier} has no Stripe price` };
  const priceId = process.env[priceEnv];
  if (!priceId) {
    return {
      ok: false,
      error: `Stripe ${priceEnv} not configured`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // RLS would let us read our own profile, but the customer-id write
  // below needs to bypass policy. Use the admin client for both reads
  // and writes here for consistency.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, handle, stripe_customer_id")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "Profile missing" };

  // Reuse or create the Stripe customer.
  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: user.email ?? undefined,
      metadata: { profileId: profile.id, handle: profile.handle },
    });
    customerId = customer.id;
    await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", profile.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard/billing?status=success`,
    cancel_url: `${appUrl}/dashboard/billing?status=cancelled`,
    // Embed the profile id so the webhook can find the row even if
    // Stripe later changes how it correlates subscriptions to customers.
    subscription_data: {
      metadata: { profileId: profile.id, tier },
    },
    metadata: { profileId: profile.id, tier },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return { ok: false, error: "Stripe did not return a checkout URL" };
  }
  return { ok: true, url: session.url };
}

/**
 * Mirror of `startCheckout` for the Billing Portal — lets paying users
 * change payment method / cancel / see invoices on Stripe's hosted UI.
 */
export async function startBillingPortal(): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();
  if (!profile?.stripe_customer_id) {
    return { ok: false, error: "No Stripe customer for this profile" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const portal = await stripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/dashboard/billing`,
  });
  return { ok: true, url: portal.url };
}

/** Convenience: form-action wrapper that redirects directly. */
export async function startCheckoutAndRedirect(tier: Tier): Promise<void> {
  const res = await startCheckout(tier);
  if (!res.ok) throw new Error(res.error);
  redirect(res.url);
}

export async function startBillingPortalAndRedirect(): Promise<void> {
  const res = await startBillingPortal();
  if (!res.ok) throw new Error(res.error);
  redirect(res.url);
}

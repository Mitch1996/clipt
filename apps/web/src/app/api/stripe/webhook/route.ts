import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { isPaidStatus, tierForPriceId, type Tier } from "@/lib/billing/plans";
import { stripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/**
 * POST /api/stripe/webhook
 *
 * Stripe → Clipt webhook receiver. Mirrors Stripe's subscription state
 * onto `profiles` so the entitlements module can answer "what tier is
 * this profile on?" in one query.
 *
 * Idempotency: every Stripe delivery is logged in `stripe_events.id`.
 * Re-deliveries (Stripe retries until 2xx) short-circuit on the unique
 * insert. Always ack 200 once the signature passes and the row is
 * logged — Stripe must not retry past that point.
 *
 * Events handled:
 *   - checkout.session.completed           → backfill subscription ids
 *     on the profile (the subscription.created event lands too, but
 *     this one carries the success-redirect timing).
 *   - customer.subscription.created/updated → tier + status + renews_at
 *   - customer.subscription.deleted         → drop to free
 *   - invoice.payment_failed                → status = past_due (UI
 *     surface shows a warning; we DON'T immediately downgrade — Stripe
 *     retries collection a few times before giving up).
 */

// The Stripe SDK needs the raw bytes for signature verification. App
// Router routes get the parsed body by default; using request.text()
// returns the raw stringified payload that constructEvent expects.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 500 },
    );
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Idempotency log. If we've already processed this event id, ack and
  // return — Stripe is just retrying.
  const { error: logErr } = await admin
    .from("stripe_events")
    .insert({
      id: event.id,
      type: event.type,
      payload: event as unknown as Json,
    });
  if (logErr) {
    // Unique-violation == 23505. Any other error is unexpected.
    if (logErr.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("stripe-webhook: insert log failed", logErr);
    return NextResponse.json({ error: "Log insert failed" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await onCheckoutCompleted(admin, session);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await onSubscriptionChanged(admin, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await onSubscriptionDeleted(admin, sub);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        await onInvoicePaymentFailed(admin, inv);
        break;
      }
      default:
        // Unhandled — log only. Adding new types is intentional.
        break;
    }
  } catch (err) {
    console.error(`stripe-webhook: ${event.type} handler threw`, err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

// ─── Handlers ────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

async function onCheckoutCompleted(
  admin: AdminClient,
  session: Stripe.Checkout.Session,
) {
  const profileId = session.metadata?.profileId ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  if (!profileId) {
    console.warn("stripe-webhook: checkout.session.completed without profileId metadata");
    return;
  }

  // Only patch what we know now. The subscription.created event that
  // follows will set tier + renews_at when we can see the price.
  await admin
    .from("profiles")
    .update({
      stripe_customer_id: customerId ?? undefined,
      stripe_subscription_id: subscriptionId ?? undefined,
    })
    .eq("id", profileId);
}

async function onSubscriptionChanged(
  admin: AdminClient,
  sub: Stripe.Subscription,
) {
  const priceId = sub.items.data[0]?.price.id ?? null;
  const tier: Tier = tierForPriceId(priceId) ?? "free";
  const profileId = await resolveProfileId(admin, sub);
  if (!profileId) return;

  // Stripe sometimes nests period dates on the item, sometimes on the
  // subscription itself depending on API version. Try both.
  const renewsAtUnix =
    sub.items.data[0]?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;

  await admin
    .from("profiles")
    .update({
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      subscription_price_id: priceId,
      subscription_tier: isPaidStatus(sub.status) ? tier : "free",
      subscription_renews_at: renewsAtUnix
        ? new Date(renewsAtUnix * 1000).toISOString()
        : null,
    })
    .eq("id", profileId);
}

async function onSubscriptionDeleted(
  admin: AdminClient,
  sub: Stripe.Subscription,
) {
  const profileId = await resolveProfileId(admin, sub);
  if (!profileId) return;
  await admin
    .from("profiles")
    .update({
      subscription_status: "canceled",
      subscription_tier: "free",
      stripe_subscription_id: null,
      subscription_price_id: null,
      subscription_renews_at: null,
    })
    .eq("id", profileId);
}

async function onInvoicePaymentFailed(admin: AdminClient, inv: Stripe.Invoice) {
  // Invoice carries the subscription id directly; correlate via that.
  const subscriptionId =
    typeof (inv as unknown as { subscription?: string | Stripe.Subscription }).subscription ===
    "string"
      ? ((inv as unknown as { subscription: string }).subscription)
      : null;
  if (!subscriptionId) return;
  await admin
    .from("profiles")
    .update({ subscription_status: "past_due" })
    .eq("stripe_subscription_id", subscriptionId);
}

async function resolveProfileId(
  admin: AdminClient,
  sub: Stripe.Subscription,
): Promise<string | null> {
  // First choice: the metadata we stamped at checkout.
  const fromMeta = sub.metadata?.profileId ?? null;
  if (fromMeta) return fromMeta;

  // Fallback: look up by stripe_customer_id (the Subscription always
  // carries one).
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  if (!customerId) return null;
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

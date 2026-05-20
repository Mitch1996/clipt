-- ----------------------------------------------------------------
-- Subscriptions (Prompt 1.15)
-- Adds the subscription bookkeeping the Stripe webhook keeps in sync.
-- Tier-driven entitlements (clip cap, export resolution, etc.) live in
-- `apps/web/src/lib/billing/plans.ts`; this table only stores state.
-- ----------------------------------------------------------------

alter table public.profiles
  add column if not exists subscription_tier text
    not null default 'free'
    check (subscription_tier in ('free', 'creator', 'pro')),
  add column if not exists subscription_status text
    not null default 'inactive'
    check (subscription_status in (
      'inactive',     -- free tier, no Stripe subscription
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused'
    )),
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_renews_at timestamptz,
  -- Cached at webhook time so the dashboard can render the usage panel
  -- without doing a Stripe round-trip on every page load.
  add column if not exists subscription_price_id text;

create unique index if not exists profiles_stripe_subscription_id_idx
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ----------------------------------------------------------------
-- Stripe events log
-- We log every webhook delivery so re-runs are idempotent. The webhook
-- handler does:
--   1. Verify signature.
--   2. Try to insert (event_id is unique). If it already exists, ack
--      200 immediately — Stripe retries until it gets one.
--   3. Otherwise apply the event + log the row.
-- ----------------------------------------------------------------
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.stripe_events enable row level security;
-- No client ever reads or writes this — service role only.

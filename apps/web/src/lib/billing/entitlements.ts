import "server-only";

import { PLANS, type Tier, isPaidStatus } from "./plans";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side entitlements oracle. Single source of truth for "what is
 * this profile allowed to do right now?". Callers — server actions, the
 * dashboard, the Inngest pipeline — should read from here and never
 * hand-roll a `tier === 'free'` check.
 */

export interface ProfileEntitlements {
  tier: Tier;
  effectiveTier: Tier; // tier respecting payment status (past_due is still paid)
  monthlyClipLimit: number | null;
  clipsThisMonth: number;
  clipsRemaining: number | null; // null when unlimited
  renewsAt: string | null;
  status: string;
  /** True for staff/founders. Bypasses the clip cap regardless of tier. */
  isAdmin: boolean;
}

export async function getEntitlements(
  profileId: string,
): Promise<ProfileEntitlements> {
  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role, subscription_tier, subscription_status, subscription_renews_at")
    .eq("id", profileId)
    .single();
  if (error || !profile) {
    throw new Error(`entitlements: profile ${profileId} not found`);
  }

  const isAdmin = profile.role === "admin";
  const rawTier = (profile.subscription_tier ?? "free") as Tier;
  const status = profile.subscription_status ?? "inactive";
  // Admins are effectively on Pro — unlimited cap, all features unlocked.
  const effectiveTier: Tier = isAdmin
    ? "pro"
    : isPaidStatus(status)
      ? rawTier
      : "free";
  const plan = PLANS[effectiveTier];

  // Clip count for the current calendar month. Soft-deleted clips still
  // count toward the cap — the cap is about *work the pipeline did*,
  // not what survives in the UI.
  const monthStart = startOfMonthIso();
  const { count } = await admin
    .from("clips")
    .select("id", { head: true, count: "exact" })
    .eq("clipper_profile_id", profileId)
    .gte("created_at", monthStart);
  const clipsThisMonth = count ?? 0;

  const monthlyClipLimit = isAdmin ? null : plan.monthlyClipLimit;
  const clipsRemaining =
    monthlyClipLimit === null
      ? null
      : Math.max(0, monthlyClipLimit - clipsThisMonth);

  return {
    tier: rawTier,
    effectiveTier,
    monthlyClipLimit,
    clipsThisMonth,
    clipsRemaining,
    renewsAt: profile.subscription_renews_at,
    status,
    isAdmin,
  };
}

/**
 * Cheap pre-flight used by `createClipFromUrl` to refuse before any
 * Stripe / Inngest work. Returns `{ ok: false, reason }` when the
 * monthly clip cap is hit.
 */
export type CanCreateClipResult =
  | { ok: true }
  | { ok: false; reason: "monthly_limit"; limit: number; used: number };

export async function canCreateClip(
  profileId: string,
): Promise<CanCreateClipResult> {
  const ent = await getEntitlements(profileId);
  if (ent.monthlyClipLimit === null) return { ok: true };
  if (ent.clipsThisMonth >= ent.monthlyClipLimit) {
    return {
      ok: false,
      reason: "monthly_limit",
      limit: ent.monthlyClipLimit,
      used: ent.clipsThisMonth,
    };
  }
  return { ok: true };
}

function startOfMonthIso(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return start.toISOString();
}

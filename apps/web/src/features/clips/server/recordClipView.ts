"use server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bumps `clips.view_count_total` by 1 for the given clip. Fired from
 * `/c/[id]` on mount via a tiny client-side component.
 *
 * V1: dumb counter, no dedupe. A reload counts as a view, multi-tab
 * counts twice, refresh-spamming the same clip counts each time. We
 * accept that imprecision for the social-vanity counter — the
 * cross-platform analytics in `clip_posts` is the authoritative number
 * for billing/payout decisions.
 *
 * Uses admin client because the public-read RLS policy on `clips`
 * grants SELECT but not UPDATE to anon — keeping that locked down is
 * the whole point of RLS. The increment is RPC-style atomic via the
 * SQL expression so concurrent views don't lose count.
 */
export async function recordClipView(clipId: string): Promise<void> {
  const admin = createAdminClient();
  // Atomically increment: avoid the read-modify-write race that would
  // drop views under concurrency by doing the +1 in SQL.
  const { error } = await admin.rpc("increment_clip_view", { p_clip_id: clipId });
  if (error) {
    // Best-effort. If the RPC isn't deployed yet (or perms are off)
    // we silently no-op — the view counter is non-critical and we
    // don't want a 500 to take down /c/[id].
    console.warn("recordClipView:", error.message);
  }
}

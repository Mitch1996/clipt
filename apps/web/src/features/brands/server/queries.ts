import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Read-side queries for the brand console. Kept separate from
 * actions.ts so client/server-component reads don't accidentally
 * pull in the "use server" mutation surface.
 */

export interface CampaignRow {
  id: string;
  title: string;
  status: string;
  brief: string;
  budget_cents: number;
  spent_cents: number;
  cpm_cents: number;
  max_per_clip_cents: number | null;
  niche: string;
  brand_safety_tier: string;
  geo: string[];
  languages: string[];
  allowed_platforms: string[];
  brand_handle: string | null;
  created_at: string;
  updated_at: string;
  ends_at: string | null;
}

export interface CampaignWithCounts extends CampaignRow {
  submissionCount: number;
  pendingReviewCount: number;
}

export async function listMyCampaigns(): Promise<CampaignWithCounts[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("campaigns")
    .select(
      "id, title, status, brief, budget_cents, spent_cents, cpm_cents, max_per_clip_cents, niche, brand_safety_tier, geo, languages, allowed_platforms, brand_handle, created_at, updated_at, ends_at",
    )
    .eq("brand_profile_id", user.id)
    .order("created_at", { ascending: false });
  if (!rows) return [];

  // One round-trip per campaign for counts is fine at <100 campaigns
  // per brand. If that scales up, swap to a single aggregate RPC.
  const out: CampaignWithCounts[] = [];
  for (const row of rows) {
    const [{ count: subTotal }, { count: subPending }] = await Promise.all([
      admin
        .from("campaign_submissions")
        .select("id", { head: true, count: "exact" })
        .eq("campaign_id", row.id),
      admin
        .from("campaign_submissions")
        .select("id", { head: true, count: "exact" })
        .eq("campaign_id", row.id)
        .eq("status", "pending_review"),
    ]);
    out.push({
      ...(row as CampaignRow),
      submissionCount: subTotal ?? 0,
      pendingReviewCount: subPending ?? 0,
    });
  }
  return out;
}


export interface CampaignDetail extends CampaignRow {
  sources: Array<{
    id: string;
    source_url: string | null;
    title: string | null;
    position: number;
  }>;
  submissions: Array<{
    id: string;
    status: string;
    reviewer_notes: string | null;
    verified_views: number;
    earned_cents: number;
    created_at: string;
    approved_at: string | null;
    clip: {
      id: string;
      title: string | null;
      duration_seconds: number | null;
    } | null;
    clipper: {
      id: string;
      handle: string | null;
    } | null;
  }>;
}

export async function getCampaignDetail(
  campaignId: string,
): Promise<CampaignDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select(
      "id, title, status, brief, budget_cents, spent_cents, cpm_cents, max_per_clip_cents, niche, brand_safety_tier, geo, languages, allowed_platforms, brand_handle, created_at, updated_at, ends_at, brand_profile_id",
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;

  // Brand owner OR admin OR (campaign active + any signed-in user).
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const canSee =
    campaign.brand_profile_id === user.id ||
    profile?.role === "admin" ||
    campaign.status === "active";
  if (!canSee) return null;

  const [{ data: sources }, { data: submissions }] = await Promise.all([
    admin
      .from("campaign_sources")
      .select("id, source_url, title, position")
      .eq("campaign_id", campaignId)
      .order("position", { ascending: true }),
    admin
      .from("campaign_submissions")
      .select(
        "id, status, reviewer_notes, verified_views, earned_cents, created_at, approved_at, clip:clips!campaign_submissions_clip_id_fkey(id, title, duration_seconds), clipper:profiles!campaign_submissions_clipper_profile_id_fkey(id, handle)",
      )
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  ]);

  const { brand_profile_id: _ownerId, ...campaignFields } = campaign;
  return {
    ...(campaignFields as CampaignRow),
    sources: (sources ?? []) as CampaignDetail["sources"],
    submissions: (submissions ?? []) as unknown as CampaignDetail["submissions"],
  };
}


export interface BrandAccessRequestRow {
  id: string;
  profile_id: string;
  company_name: string;
  company_url: string | null;
  intended_use: string;
  status: string;
  created_at: string;
  profile: { handle: string | null; display_name: string | null } | null;
}

export async function listBrandAccessRequests(): Promise<BrandAccessRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return [];

  const { data: rows } = await admin
    .from("brand_access_requests")
    .select(
      "id, profile_id, company_name, company_url, intended_use, status, created_at, profile:profiles!brand_access_requests_profile_id_fkey(handle, display_name)",
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  return (rows ?? []) as unknown as BrandAccessRequestRow[];
}


export async function getMyBrandAccessRequest(): Promise<{
  status: string;
  reviewer_notes: string | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_access_requests")
    .select("status, reviewer_notes")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data;
}

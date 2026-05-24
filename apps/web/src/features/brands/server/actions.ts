"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  brandAccessRequestSchema,
  createCampaignSchema,
  reviewSubmissionSchema,
  type BrandAccessRequestInput,
  type CreateCampaignInput,
  type ReviewSubmissionInput,
} from "../schema";

/**
 * Brand-side server actions. All gated by either:
 *   - the brand role on profiles (campaign read/write/review)
 *   - the admin role (brand-access request approval)
 *   - the caller's own profile (brand-access request creation)
 *
 * Submissions are mutated by the brand (review) OR by the clipper
 * (create). Clipper-side submission creation lives in features/
 * clippers/ once Phase 4.3 ships; this file only covers the brand
 * surface.
 */

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

async function requireBrand(): Promise<
  | { profileId: string; isAdmin: boolean }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Profile not found" };
  if (profile.role !== "brand" && profile.role !== "admin") {
    return { error: "Brand access required" };
  }
  return { profileId: user.id, isAdmin: profile.role === "admin" };
}


// ─── Brand-access requests ──────────────────────────────────────

export async function submitBrandAccessRequest(
  raw: BrandAccessRequestInput,
): Promise<Result<{ id: string }>> {
  const parsed = brandAccessRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();
  // Idempotent: if a pending or approved request exists, return it
  // rather than 23505'ing.
  const { data: existing } = await admin
    .from("brand_access_requests")
    .select("id, status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (existing) {
    if (existing.status === "approved") {
      return { ok: false, error: "Your brand access is already approved." };
    }
    if (existing.status === "pending") {
      return { ok: true, id: existing.id };
    }
    // rejected → allow resubmission by deleting the old row.
    await admin.from("brand_access_requests").delete().eq("id", existing.id);
  }

  const { data: inserted, error } = await admin
    .from("brand_access_requests")
    .insert({
      profile_id: user.id,
      company_name: parsed.data.company_name,
      company_url: parsed.data.company_url || null,
      intended_use: parsed.data.intended_use,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Insert failed" };
  }

  revalidatePath("/brands");
  revalidatePath("/dashboard/admin/brand-requests");
  return { ok: true, id: inserted.id };
}


/** Admin-only — approve a pending brand access request and promote
 *  the requesting profile's role to 'brand'. */
export async function approveBrandAccess(
  requestId: string,
  notes?: string,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false, error: "Admins only" };
  }

  const { data: req } = await admin
    .from("brand_access_requests")
    .select("id, profile_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };
  if (req.status !== "pending") {
    return { ok: false, error: `Request is already ${req.status}` };
  }

  // Promote the profile + mark the request approved in one logical
  // unit. We don't have transactions here, so order matters: flip
  // the role first (the user starts seeing /brands on next nav);
  // then stamp the request. A failure between writes leaves the user
  // promoted but the request unstamped, which is benign (admin can
  // re-process).
  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role: "brand" })
    .eq("id", req.profile_id);
  if (roleErr) return { ok: false, error: roleErr.message };

  const { error: stampErr } = await admin
    .from("brand_access_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewer_notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (stampErr) return { ok: false, error: stampErr.message };

  revalidatePath("/dashboard/admin/brand-requests");
  revalidatePath("/brands");
  return { ok: true };
}


export async function rejectBrandAccess(
  requestId: string,
  notes?: string,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false, error: "Admins only" };
  }

  const { error } = await admin
    .from("brand_access_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewer_notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/admin/brand-requests");
  return { ok: true };
}


// ─── Campaigns ──────────────────────────────────────────────────

export async function createCampaign(
  raw: CreateCampaignInput,
): Promise<Result<{ campaignId: string }>> {
  const parsed = createCampaignSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const gate = await requireBrand();
  if ("error" in gate) return { ok: false, error: gate.error };
  // Per-clip cap > total budget makes no sense.
  if (
    parsed.data.max_per_clip_cents &&
    parsed.data.max_per_clip_cents > parsed.data.budget_cents
  ) {
    return {
      ok: false,
      error: "Max per-clip cap can't exceed the total budget.",
    };
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("campaigns")
    .insert({
      brand_profile_id: gate.profileId,
      title: parsed.data.title,
      brief: parsed.data.brief,
      budget_cents: parsed.data.budget_cents,
      cpm_cents: parsed.data.cpm_cents,
      max_per_clip_cents: parsed.data.max_per_clip_cents ?? null,
      niche: parsed.data.niche,
      brand_safety_tier: parsed.data.brand_safety_tier,
      geo: parsed.data.geo,
      languages: parsed.data.languages,
      allowed_platforms: parsed.data.allowed_platforms,
      brand_handle: parsed.data.brand_handle ?? null,
      ends_at: parsed.data.ends_at ?? null,
      // Campaigns start as drafts; brand explicitly activates from
      // the detail page once the budget is funded (Phase 4.1b).
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Insert failed" };
  }

  // Source URLs — insert each as a campaign_sources row.
  if (parsed.data.source_urls.length > 0) {
    const sourceRows = parsed.data.source_urls.map((url, i) => ({
      campaign_id: inserted.id,
      source_url: url,
      position: i,
    }));
    const { error: srcErr } = await admin
      .from("campaign_sources")
      .insert(sourceRows);
    if (srcErr) {
      // Don't unwind the campaign on a source-insert failure — brand
      // can add sources from the detail page.
      console.warn("campaign source insert failed:", srcErr);
    }
  }

  revalidatePath("/brands/dashboard");
  revalidatePath(`/brands/campaigns/${inserted.id}`);
  return { ok: true, campaignId: inserted.id };
}


export async function setCampaignStatus(
  campaignId: string,
  status: "draft" | "active" | "paused" | "ended",
): Promise<Result> {
  const gate = await requireBrand();
  if ("error" in gate) return { ok: false, error: gate.error };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("campaigns")
    .select("brand_profile_id, budget_cents, spent_cents")
    .eq("id", campaignId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Campaign not found" };
  if (!gate.isAdmin && row.brand_profile_id !== gate.profileId) {
    return { ok: false, error: "Not yours" };
  }
  // Refuse to activate a campaign with no remaining budget.
  if (status === "active" && row.spent_cents >= row.budget_cents) {
    return {
      ok: false,
      error: "Budget exhausted — top up before reactivating.",
    };
  }
  const { error } = await admin
    .from("campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/brands/dashboard");
  revalidatePath(`/brands/campaigns/${campaignId}`);
  return { ok: true };
}


export async function reviewSubmission(
  raw: ReviewSubmissionInput,
): Promise<Result> {
  const parsed = reviewSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const gate = await requireBrand();
  if ("error" in gate) return { ok: false, error: gate.error };
  const admin = createAdminClient();

  // Verify the brand owns the submission's parent campaign.
  const { data: sub } = await admin
    .from("campaign_submissions")
    .select("id, status, campaigns!campaign_submissions_campaign_id_fkey(brand_profile_id)")
    .eq("id", parsed.data.submission_id)
    .maybeSingle();
  if (!sub) return { ok: false, error: "Submission not found" };
  if (sub.status !== "pending_review") {
    return { ok: false, error: `Submission is already ${sub.status}` };
  }
  const campaignBrandId = (
    sub.campaigns as { brand_profile_id: string } | null
  )?.brand_profile_id;
  if (!gate.isAdmin && campaignBrandId !== gate.profileId) {
    return { ok: false, error: "Not yours" };
  }

  const nextStatus =
    parsed.data.decision === "approve" ? "approved" : "rejected";
  const { error } = await admin
    .from("campaign_submissions")
    .update({
      status: nextStatus,
      reviewer_notes: parsed.data.notes ?? null,
      approved_at:
        parsed.data.decision === "approve" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.submission_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/brands/dashboard");
  return { ok: true };
}

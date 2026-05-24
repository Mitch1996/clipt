import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Clock, X } from "lucide-react";

import { BrandAccessRequestForm } from "@/features/brands/components/BrandAccessRequestForm";
import { getMyBrandAccessRequest } from "@/features/brands/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Brand console — Clipt",
};
export const dynamic = "force-dynamic";

/**
 * /brands — landing page. Behaviour by role:
 *   - 'brand' or 'admin' → redirect into /brands/dashboard
 *   - everyone else → show benefits + request-access form, OR the
 *     pending/rejected status if they've already submitted
 */
export default async function BrandsLanding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/brands");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "brand" || profile?.role === "admin") {
    redirect("/brands/dashboard");
  }

  const myRequest = await getMyBrandAccessRequest();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Brand console
      </span>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
        Run clipping campaigns
        <br />
        <span className="text-accent">with verifiable ROI.</span>
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
        Fund a campaign, set CPM, and let KYC&rsquo;d clippers turn your
        source content into vertical shorts. Every clip carries a
        cryptographic attribution signature and auto-discloses #ad +
        the platform&rsquo;s paid-partnership tag.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Benefit
          title="Pay per verified view"
          body="No flat fees. Budget caps both total + per-clip. Views are counted post-deduction."
        />
        <Benefit
          title="Audit-grade reporting"
          body="Every campaign exports an FTC-compliant PDF with clip-by-clip attribution + disclosure proof."
        />
        <Benefit
          title="Brand safety tiers"
          body="Filter clippers by KYC tier (bronze / silver / gold) and geographic + language fit."
        />
        <Benefit
          title="Multi-platform reach"
          body="Clippers post to TikTok, Reels, and YouTube Shorts. Engagement aggregates back into one dashboard."
        />
      </div>

      <div className="mt-14 rounded-md border border-border bg-card p-6 md:p-8">
        {myRequest?.status === "pending" ? (
          <RequestStatus
            icon={<Clock className="h-4 w-4" />}
            tone="pending"
            title="Request pending"
            body="An admin will review your request within 1 business day. We&rsquo;ll email you the moment your account is promoted."
          />
        ) : myRequest?.status === "approved" ? (
          // Theoretically unreachable — we redirect above if role is
          // 'brand' — but render defensively in case the role flip
          // races a stale read.
          <RequestStatus
            icon={<BadgeCheck className="h-4 w-4 text-mint" />}
            tone="approved"
            title="Approved — refresh to enter"
            body={
              <>
                Your access is live. Go to{" "}
                <Link href="/brands/dashboard" className="text-accent underline">
                  the dashboard
                </Link>{" "}
                to create your first campaign.
              </>
            }
          />
        ) : myRequest?.status === "rejected" ? (
          <RequestStatus
            icon={<X className="h-4 w-4 text-destructive" />}
            tone="rejected"
            title="Previous request not approved"
            body={
              myRequest.reviewer_notes
                ? `Reviewer notes: ${myRequest.reviewer_notes}`
                : "You can submit a new request below — describe your campaign plans in more detail."
            }
          />
        ) : null}

        {myRequest?.status !== "pending" ? (
          <>
            {myRequest ? (
              <hr className="my-6 border-border" />
            ) : null}
            <h2 className="text-2xl font-bold tracking-[-0.02em]">
              Request brand access
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Brand-tier accounts are admin-approved. Tell us about your
              company so we can promote you quickly.
            </p>
            <div className="mt-6">
              <BrandAccessRequestForm />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Benefit({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-4">
      <h3 className="text-sm font-semibold tracking-[-0.005em]">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function RequestStatus({
  icon,
  tone,
  title,
  body,
}: {
  icon: React.ReactNode;
  tone: "pending" | "approved" | "rejected";
  title: string;
  body: React.ReactNode;
}) {
  const toneClasses =
    tone === "approved"
      ? "border-mint/40 bg-mint/[0.06]"
      : tone === "rejected"
        ? "border-destructive/40 bg-destructive/[0.06]"
        : "border-accent/40 bg-accent/[0.06]";
  return (
    <div className={`rounded-md border ${toneClasses} p-4`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="font-mono text-[10px] uppercase tracking-[0.14em]">
          {title}
        </p>
      </div>
      <p className="mt-2 text-sm">{body}</p>
    </div>
  );
}

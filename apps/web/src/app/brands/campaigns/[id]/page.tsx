import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock } from "lucide-react";

import { CampaignStatusControls } from "@/features/brands/components/CampaignStatusControls";
import { SubmissionReviewButtons } from "@/features/brands/components/SubmissionReviewButtons";
import { getCampaignDetail } from "@/features/brands/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Campaign — Clipt" };
export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=/brands/campaigns/${id}`);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "brand" && profile?.role !== "admin") {
    redirect("/brands");
  }

  const campaign = await getCampaignDetail(id);
  if (!campaign) notFound();

  const status = campaign.status as "draft" | "active" | "paused" | "ended";
  const pendingCount = campaign.submissions.filter(
    (s) => s.status === "pending_review",
  ).length;
  const approvedCount = campaign.submissions.filter(
    (s) => s.status === "approved" || s.status === "paid",
  ).length;
  const totalViews = campaign.submissions.reduce(
    (sum, s) => sum + (s.verified_views ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/brands/dashboard"
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
      >
        ← Campaigns
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            {campaign.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              · {campaign.niche}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              · {campaign.brand_safety_tier}+ clippers
            </span>
            {campaign.brand_handle ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                · {campaign.brand_handle}
              </span>
            ) : null}
          </div>
        </div>
        <CampaignStatusControls campaignId={campaign.id} current={status} />
      </div>

      {/* ── Summary stats ────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
        <Stat
          kicker="Budget"
          value={formatCents(campaign.budget_cents)}
          money
        />
        <Stat
          kicker="Spent"
          value={formatCents(campaign.spent_cents)}
          money
          suffix={`/ ${formatCents(campaign.budget_cents)}`}
        />
        <Stat kicker="CPM" value={formatCents(campaign.cpm_cents)} />
        <Stat
          kicker="Total verified views"
          value={totalViews.toLocaleString()}
        />
      </div>

      {/* ── Brief ────────────────────────────────────────────── */}
      <div className="mt-8 rounded-md border border-border bg-card p-5 md:p-6">
        <h2 className="text-sm font-semibold tracking-[-0.005em]">Brief</h2>
        {campaign.brief ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {campaign.brief}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No brief yet.
          </p>
        )}
      </div>

      {/* ── Sources ──────────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          Source videos{" "}
          <span className="font-mono text-xs font-normal uppercase tracking-[0.14em] text-muted-foreground">
            · {campaign.sources.length}
          </span>
        </h2>
        {campaign.sources.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
            No sources yet — add some on the (forthcoming) edit page so
            clippers have material to work with.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {campaign.sources.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-border bg-card p-3 text-sm"
              >
                {s.title ? (
                  <p className="font-medium">{s.title}</p>
                ) : null}
                {s.source_url ? (
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-[11px] text-accent hover:underline"
                  >
                    {s.source_url}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Submissions ─────────────────────────────────────── */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            Submissions{" "}
            <span className="font-mono text-xs font-normal uppercase tracking-[0.14em] text-muted-foreground">
              · {campaign.submissions.length} total · {approvedCount} approved
              · {pendingCount} pending
            </span>
          </h2>
        </div>
        {campaign.submissions.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-border bg-card/40 px-4 py-8 text-center">
            <Clock
              className="mx-auto h-6 w-6 text-muted-foreground"
              aria-hidden
            />
            <p className="mt-3 text-sm text-muted-foreground">
              No submissions yet. Once the campaign is{" "}
              <span className="text-foreground">active</span> +
              clippers find it in the marketplace, their submitted clips
              land here.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {campaign.submissions.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/c/${s.clip?.id ?? ""}`}
                      target="_blank"
                      className="font-medium hover:text-accent"
                    >
                      {s.clip?.title ?? "Untitled clip"}
                    </Link>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      by @{s.clipper?.handle ?? "unknown"} ·{" "}
                      {new Date(s.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    {s.reviewer_notes ? (
                      <p className="mt-2 text-xs italic text-muted-foreground">
                        Note: {s.reviewer_notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    {s.status === "pending_review" ? (
                      <SubmissionReviewButtons submissionId={s.id} />
                    ) : (
                      <SubmissionStatusPill status={s.status} />
                    )}
                  </div>
                </div>
                {s.status === "approved" || s.status === "paid" ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <MiniStat
                      label="Verified views"
                      value={(s.verified_views ?? 0).toLocaleString()}
                    />
                    <MiniStat
                      label="Earned"
                      value={formatCents(s.earned_cents ?? 0)}
                      money
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  kicker,
  value,
  suffix,
  money,
}: {
  kicker: string;
  value: string;
  suffix?: string;
  money?: boolean;
}) {
  return (
    <div className="bg-background p-5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {kicker}
      </span>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`tnum text-2xl font-bold tracking-[-0.02em] md:text-3xl ${
            money ? "text-mint" : "text-foreground"
          }`}
        >
          {value}
        </span>
        {suffix ? (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  money,
}: {
  label: string;
  value: string;
  money?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`tnum mt-0.5 font-semibold ${money ? "text-mint" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "draft" | "active" | "paused" | "ended";
}) {
  const toneClasses =
    status === "active"
      ? "border-mint/40 bg-mint/10 text-mint"
      : status === "paused"
        ? "border-accent/40 bg-accent/10 text-accent"
        : status === "ended"
          ? "border-muted-foreground/40 bg-muted text-muted-foreground"
          : "border-border bg-card text-muted-foreground";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${toneClasses}`}
    >
      {status}
    </span>
  );
}

function SubmissionStatusPill({ status }: { status: string }) {
  const toneClasses =
    status === "approved"
      ? "border-mint/40 bg-mint/10 text-mint"
      : status === "paid"
        ? "border-mint/60 bg-mint/20 text-mint"
        : status === "rejected"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : status === "disputed"
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-card text-muted-foreground";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${toneClasses}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function formatCents(cents: number): string {
  return `€${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

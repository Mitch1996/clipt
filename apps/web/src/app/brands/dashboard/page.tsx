import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listMyCampaigns } from "@/features/brands/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Brand dashboard — Clipt" };
export const dynamic = "force-dynamic";

export default async function BrandDashboard() {
  // Hard gate inside the page too — layout gates the surface, but a
  // direct /brands/dashboard hit needs to land somewhere useful for
  // non-brands instead of erroring silently.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/brands/dashboard");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "brand" && profile?.role !== "admin") {
    redirect("/brands");
  }

  const campaigns = await listMyCampaigns();

  const totals = campaigns.reduce(
    (acc, c) => {
      acc.budget += c.budget_cents;
      acc.spent += c.spent_cents;
      acc.pending += c.pendingReviewCount;
      if (c.status === "active") acc.active += 1;
      return acc;
    },
    { budget: 0, spent: 0, pending: 0, active: 0 },
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Brand console
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Campaigns
          </h1>
        </div>
        <Button
          asChild
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Link href="/brands/campaigns/new">
            <Plus className="mr-1 h-3.5 w-3.5" />
            New campaign
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
        <Stat
          kicker="Active"
          value={totals.active.toString()}
          suffix="campaigns"
        />
        <Stat
          kicker="Pending review"
          value={totals.pending.toString()}
          suffix="submissions"
          highlight={totals.pending > 0}
        />
        <Stat
          kicker="Total budget"
          value={formatCents(totals.budget)}
          money
        />
        <Stat kicker="Spent" value={formatCents(totals.spent)} money />
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-12 rounded-md border border-dashed border-border bg-card/40 p-12 text-center">
          <Sparkles
            className="mx-auto h-8 w-8 text-accent"
            strokeWidth={1.5}
            aria-hidden
          />
          <h2 className="mt-4 text-xl font-semibold tracking-[-0.01em]">
            No campaigns yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Create your first campaign to invite KYC&rsquo;d clippers to turn
            your source content into vertical shorts.
          </p>
          <Button
            asChild
            className="mt-6 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Link href="/brands/campaigns/new">Create campaign</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/brands/campaigns/${c.id}`}
                className="group block rounded-md border border-border bg-card p-5 transition-colors hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold tracking-[-0.005em] group-hover:text-accent">
                    {c.title}
                  </h3>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusPill status={c.status} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    · {c.niche}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    · {c.brand_safety_tier}+ clippers
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <MiniStat
                    label="Budget"
                    value={formatCents(c.budget_cents)}
                  />
                  <MiniStat
                    label="Spent"
                    value={formatCents(c.spent_cents)}
                    money
                  />
                  <MiniStat
                    label="CPM"
                    value={formatCents(c.cpm_cents)}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <span>
                    {c.submissionCount} submission
                    {c.submissionCount === 1 ? "" : "s"}
                  </span>
                  {c.pendingReviewCount > 0 ? (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">
                      {c.pendingReviewCount} pending review
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  kicker,
  value,
  suffix,
  money,
  highlight,
}: {
  kicker: string;
  value: string;
  suffix?: string;
  money?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="bg-background p-5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {kicker}
      </span>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`tnum text-2xl font-bold tracking-[-0.02em] md:text-3xl ${
            money ? "text-mint" : highlight ? "text-accent" : "text-foreground"
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

function StatusPill({ status }: { status: string }) {
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

function formatCents(cents: number): string {
  return `€${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

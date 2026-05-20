import { redirect } from "next/navigation";

import { PlanCard } from "@/features/billing/components/PlanCard";
import { getEntitlements } from "@/lib/billing/entitlements";
import { PLANS, TIERS } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Billing — Clipt",
};

interface BillingPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/dashboard/billing");

  const { status } = await searchParams;
  const ent = await getEntitlements(user.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Billing
      </span>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
        Plans &amp; usage
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Every clip pays the creator. Pick the plan that fits how much you
        clip — usage limits reset on the 1st of each month.
      </p>

      {status === "success" ? (
        <div className="mt-8 rounded-md border border-mint/30 bg-mint/5 px-4 py-3 text-sm text-mint">
          Subscription active. Welcome to {PLANS[ent.effectiveTier].name}.
        </div>
      ) : null}
      {status === "cancelled" ? (
        <div className="mt-8 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Checkout cancelled. No changes were made.
        </div>
      ) : null}

      <div className="mt-10 rounded-md border border-border bg-card p-6">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Current plan
          </span>
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            {PLANS[ent.effectiveTier].name}
          </span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="text-foreground tnum">{ent.clipsThisMonth}</span> clip
          {ent.clipsThisMonth === 1 ? "" : "s"} this month
          {ent.monthlyClipLimit !== null ? (
            <>
              {" "}of <span className="text-foreground tnum">{ent.monthlyClipLimit}</span>.
            </>
          ) : (
            <> · unlimited.</>
          )}
        </p>
        {ent.renewsAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Renews {new Date(ent.renewsAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        ) : null}
        {ent.status === "past_due" ? (
          <p className="mt-2 text-xs text-destructive">
            Last payment failed. Stripe will retry, but update your card in
            "Manage subscription" if needed.
          </p>
        ) : null}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <PlanCard
            key={tier}
            plan={PLANS[tier]}
            currentTier={ent.effectiveTier}
          />
        ))}
      </div>
    </div>
  );
}

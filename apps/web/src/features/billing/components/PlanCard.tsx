"use client";

import { Check } from "lucide-react";

import { startBillingPortalAndRedirect, startCheckoutAndRedirect } from "@/features/billing/server/checkout";
import { Button } from "@/components/ui/button";
import { type Plan, type Tier } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  plan: Plan;
  /** The user's currently-effective tier (status-respecting). */
  currentTier: Tier;
}

export function PlanCard({ plan, currentTier }: PlanCardProps) {
  const isCurrent = plan.tier === currentTier;
  const isFreeRow = plan.tier === "free";

  async function onSubscribe() {
    await startCheckoutAndRedirect(plan.tier);
  }

  async function onManage() {
    await startBillingPortalAndRedirect();
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border p-6 transition-colors",
        isCurrent
          ? "border-accent/60 bg-accent/5"
          : "border-border bg-card hover:border-accent/40",
      )}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold tracking-[-0.01em]">{plan.name}</h3>
        {isCurrent ? (
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            Current
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-[-0.02em]">{plan.price}</p>
      <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-1 items-end">
        {isFreeRow ? (
          <Button variant="outline" disabled className="w-full">
            {isCurrent ? "Current plan" : "Default"}
          </Button>
        ) : isCurrent ? (
          <form action={onManage} className="w-full">
            <Button type="submit" variant="outline" className="w-full">
              Manage subscription
            </Button>
          </form>
        ) : (
          <form action={onSubscribe} className="w-full">
            <Button type="submit" className="w-full">
              Upgrade to {plan.name}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

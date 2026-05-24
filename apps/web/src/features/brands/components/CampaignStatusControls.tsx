"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/hooks/use-toast";

import { setCampaignStatus } from "../server/actions";

interface Props {
  campaignId: string;
  current: "draft" | "active" | "paused" | "ended";
}

/**
 * Brand-side status controls for a campaign. Surfaced as a tight
 * row of buttons on the detail page — the active state is shown
 * disabled.
 *
 * Activating from draft is the moment the campaign appears in the
 * clipper marketplace. Pausing stops new submissions but keeps
 * existing approvals accruing earnings (see actions.ts notes).
 */
const NEXT_STATES: Record<Props["current"], Props["current"][]> = {
  draft: ["active"],
  active: ["paused", "ended"],
  paused: ["active", "ended"],
  ended: [], // terminal — refunds happen in 4.1b
};

const LABEL: Record<Props["current"], string> = {
  draft: "Activate",
  active: "Pause",
  paused: "Resume",
  ended: "Ended",
};

export function CampaignStatusControls({ campaignId, current }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState<string | null>(null);

  const transitions = NEXT_STATES[current];
  if (transitions.length === 0) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Terminal state
      </span>
    );
  }

  async function go(next: Props["current"]) {
    if (pending) return;
    setPending(next);
    const result = await setCampaignStatus(campaignId, next);
    setPending(null);
    if (!result.ok) {
      toast({
        title: "Couldn't change status",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: `Campaign ${next}`,
      description:
        next === "active"
          ? "Live in the clipper marketplace."
          : next === "paused"
            ? "New submissions paused. Existing approvals keep accruing."
            : "Campaign closed.",
    });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {transitions.map((t) => {
        const label = t === "active"
          ? current === "paused"
            ? "Resume"
            : "Activate"
          : t === "paused"
            ? "Pause"
            : "End";
        return (
          <button
            key={t}
            type="button"
            onClick={() => go(t)}
            disabled={!!pending}
            className={
              t === "ended"
                ? "rounded border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive hover:bg-destructive/20 disabled:opacity-60"
                : t === "active"
                  ? "rounded border border-mint/40 bg-mint/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mint hover:bg-mint/20 disabled:opacity-60"
                  : "rounded border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:bg-accent/20 disabled:opacity-60"
            }
          >
            {pending === t ? "…" : label}
          </button>
        );
      })}
      <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        from {LABEL[current].toLowerCase()}
      </span>
    </div>
  );
}

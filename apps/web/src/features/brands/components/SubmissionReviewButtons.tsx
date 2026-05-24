"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { useToast } from "@/hooks/use-toast";

import { reviewSubmission } from "../server/actions";

interface Props {
  submissionId: string;
}

/**
 * Approve / reject buttons on a campaign_submissions row. Optimistic
 * disable while in flight; toast on outcome; router.refresh so the
 * list re-renders with the new status.
 */
export function SubmissionReviewButtons({ submissionId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState<"approve" | "reject" | null>(
    null,
  );

  async function act(decision: "approve" | "reject") {
    if (pending) return;
    setPending(decision);
    const result = await reviewSubmission({
      submission_id: submissionId,
      decision,
      notes: "",
    });
    setPending(null);
    if (!result.ok) {
      toast({
        title: "Couldn't save",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: decision === "approve" ? "Approved" : "Rejected",
      description: decision === "approve"
        ? "The clip starts accruing earnings as views land."
        : "The clipper is notified.",
    });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => act("approve")}
        disabled={!!pending}
        className="inline-flex items-center gap-1 rounded border border-mint/40 bg-mint/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mint hover:bg-mint/20 disabled:opacity-60"
      >
        <Check className="h-3 w-3" strokeWidth={3} />
        {pending === "approve" ? "Approving…" : "Approve"}
      </button>
      <button
        type="button"
        onClick={() => act("reject")}
        disabled={!!pending}
        className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive hover:bg-destructive/20 disabled:opacity-60"
      >
        <X className="h-3 w-3" />
        {pending === "reject" ? "Rejecting…" : "Reject"}
      </button>
    </div>
  );
}

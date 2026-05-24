"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { useToast } from "@/hooks/use-toast";

import { approveBrandAccess, rejectBrandAccess } from "../server/actions";

export function BrandRequestReviewButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState<"approve" | "reject" | null>(
    null,
  );
  const [notes, setNotes] = React.useState("");

  async function act(decision: "approve" | "reject") {
    if (pending) return;
    setPending(decision);
    const result =
      decision === "approve"
        ? await approveBrandAccess(requestId, notes || undefined)
        : await rejectBrandAccess(requestId, notes || undefined);
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
      title: decision === "approve" ? "Brand promoted" : "Request rejected",
      description:
        decision === "approve"
          ? "Their profile role is now brand — they can create campaigns immediately."
          : "They'll see your note + can resubmit.",
    });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Reviewer notes (optional, shared with the requester)"
        className="flex w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => act("approve")}
          disabled={!!pending}
          className="inline-flex items-center gap-1 rounded border border-mint/40 bg-mint/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mint hover:bg-mint/20 disabled:opacity-60"
        >
          <Check className="h-3 w-3" strokeWidth={3} />
          {pending === "approve" ? "Approving…" : "Approve + promote"}
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
    </div>
  );
}

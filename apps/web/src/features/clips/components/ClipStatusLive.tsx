"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

import { retryClip } from "../server/actions";
import type { ClipStatus } from "../schema";

type ClipRow = Database["public"]["Tables"]["clips"]["Row"];

export interface ClipStatusLiveProps {
  clipId: string;
  initialStatus: ClipStatus;
  initialStep: string | null;
  initialError: string | null;
}

const SUB_STATUS: Record<ClipStatus, string> = {
  pending: "Queued — waiting for a worker to pick it up.",
  processing:
    "Downloading the source, transcribing audio, reframing to vertical, and signing the attribution.",
  ready: "Done — your vertical clip is ready.",
  failed: "Something went wrong. Hit retry to try again.",
};

// Maps the processing_step token that processClip writes per-phase
// into user-facing copy. Keep in sync with the strings in
// apps/web/src/inngest/functions/processClip.ts.
const STEP_LABELS: Record<string, string> = {
  "downloading-source": "Downloading source video…",
  transcribing: "Generating captions with Whisper…",
  reframing: "Reframing to vertical 9:16 with burned captions…",
};

export function ClipStatusLive({
  clipId,
  initialStatus,
  initialStep,
  initialError,
}: ClipStatusLiveProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = React.useState<ClipStatus>(initialStatus);
  const [step, setStep] = React.useState<string | null>(initialStep);
  const [error, setError] = React.useState<string | null>(initialError);
  const [retrying, setRetrying] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Realtime enforces RLS on the broadcast — without the user's JWT
      // the websocket runs as anon, and our clips-read policy only
      // allows anon to see ready+public+non-deleted rows. So a clip
      // mid-processing would never push updates. Get the session first
      // and stamp the access token on the Realtime client.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`clip:${clipId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "clips",
            filter: `id=eq.${clipId}`,
          },
          (payload) => {
            const row = payload.new as ClipRow;
            setStatus(row.status as ClipStatus);
            setStep(row.processing_step ?? null);
            setError(row.processing_error ?? null);
            // When the row reaches a terminal state, refresh server
            // data so the page picks up new R2 keys, captions, etc.
            if (row.status === "ready" || row.status === "failed") {
              router.refresh();
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [clipId, router]);

  // When status is "processing" and we have a known step, prefer the
  // granular copy; otherwise fall back to the broad status sub-line.
  const subline =
    status === "processing" && step && STEP_LABELS[step]
      ? STEP_LABELS[step]
      : SUB_STATUS[status];

  const onRetry = async () => {
    setRetrying(true);
    const result = await retryClip(clipId);
    setRetrying(false);
    if (!result.ok) {
      toast({
        title: "Couldn't retry",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    setStatus("pending");
    setError(null);
    toast({ title: "Retrying…", description: "Re-queued for processing." });
  };

  return (
    <div className="rounded-md border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <StatusIcon status={status} />
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            <StatusLabel status={status} />
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subline}</p>
        </div>
      </div>

      {(status === "pending" || status === "processing") && (
        <div className="mt-6 space-y-2">
          <Skeleton className="aspect-[9/16] max-h-[420px] w-full max-w-[260px]" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}

      {status === "failed" && (
        <div className="mt-6 space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-destructive">
            error
          </p>
          <p className="text-sm">{error ?? "No error details available."}</p>
          <Button
            type="button"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2"
          >
            <RotateCw className="mr-1 h-3.5 w-3.5" />
            {retrying ? "Re-queueing…" : "Retry"}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: ClipStatus }) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      );
    case "ready":
      return (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-mint text-mint-foreground">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive">
          <X className="h-4 w-4" strokeWidth={3} />
        </span>
      );
  }
}

function StatusLabel({ status }: { status: ClipStatus }) {
  return (
    <span className={cn(status === "ready" && "text-mint")}>
      {status === "pending" && "Pending"}
      {status === "processing" && "Processing"}
      {status === "ready" && "Ready"}
      {status === "failed" && "Failed"}
    </span>
  );
}

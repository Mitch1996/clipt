"use client";

import * as React from "react";
import { BadgeCheck } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { AttributionPayload } from "@/lib/attribution/sign";

export interface AttributionBadgeProps {
  attribution: AttributionPayload;
  /** Raw JWT — shown in the dialog so external verifiers can copy it. */
  token: string;
}

export function AttributionBadge({
  attribution,
  token,
}: AttributionBadgeProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-medium text-mint-foreground transition-opacity hover:opacity-90"
        >
          <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
          Verified
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Verified attribution</DialogTitle>
          <DialogDescription>
            Every Clipt clip carries a cryptographic proof of where it came
            from. Anyone can verify this token against{" "}
            <a
              href="/.well-known/clipt-attribution-public-keys.json"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              our public keys
            </a>
            .
          </DialogDescription>
        </DialogHeader>

        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          <Field label="Source" value={attribution.sourcePlatform} />
          <Field
            label="Source URL"
            value={
              <a
                href={attribution.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all underline hover:text-foreground"
              >
                {attribution.sourceUrl}
              </a>
            }
          />
          <Field
            label="Cut"
            value={`${attribution.sourceStartSec.toFixed(2)}s → ${attribution.sourceEndSec.toFixed(2)}s`}
          />
          <Field
            label="Issued"
            value={
              attribution.issuedAt
                ? new Date(attribution.issuedAt).toLocaleString()
                : "—"
            }
          />
        </dl>

        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">
            JWT
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {token}
          </pre>
        </details>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </>
  );
}

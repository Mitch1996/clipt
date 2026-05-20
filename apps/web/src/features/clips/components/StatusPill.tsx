import { Loader2, Check, X, Clock } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ClipStatus } from "../schema";

export interface StatusPillProps {
  status: ClipStatus;
  className?: string;
}

/**
 * Compact status indicator for clip list cards. Bigger / inline copy
 * lives in `ClipStatusLive`; this is the minimal grid-card version.
 */
export function StatusPill({ status, className }: StatusPillProps) {
  const config = PILL_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
        config.classes,
        className,
      )}
    >
      <Icon
        className={cn("h-2.5 w-2.5", config.iconClass)}
        strokeWidth={config.strokeWidth}
      />
      {config.label}
    </span>
  );
}

const PILL_CONFIG: Record<
  ClipStatus,
  {
    label: string;
    icon: typeof Loader2;
    classes: string;
    iconClass: string;
    strokeWidth: number;
  }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    classes: "border border-border bg-secondary text-muted-foreground",
    iconClass: "",
    strokeWidth: 2,
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    classes: "border border-accent/40 bg-accent/10 text-accent",
    iconClass: "animate-spin",
    strokeWidth: 2,
  },
  ready: {
    label: "Ready",
    icon: Check,
    classes: "bg-mint/15 text-mint",
    iconClass: "",
    strokeWidth: 3,
  },
  failed: {
    label: "Failed",
    icon: X,
    classes: "border border-destructive/40 bg-destructive/10 text-destructive",
    iconClass: "",
    strokeWidth: 3,
  },
};

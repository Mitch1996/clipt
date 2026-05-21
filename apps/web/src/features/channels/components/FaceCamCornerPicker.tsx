"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  redetectFaceCamCorner,
  setFaceCamCorner,
  type FaceCamCorner,
} from "../server/setFaceCamCorner";

export interface FaceCamCornerPickerProps {
  channelId: string;
  current: FaceCamCorner;
}

/**
 * Compact 2×2 grid showing which corner of the OBS layout the
 * streamer's face cam lives in. Pre-empts the auto-detector when set —
 * the reframe worker skips clustering and just crops the named corner.
 *
 * "Auto" is the centre tile (un-pick), restoring detection.
 */
export function FaceCamCornerPicker({
  channelId,
  current,
}: FaceCamCornerPickerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  async function pick(value: FaceCamCorner) {
    if (pending) return;
    setPending(true);
    const result = await setFaceCamCorner(channelId, value);
    setPending(false);
    if (!result.ok) {
      toast({
        title: "Couldn't save",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    if (result.rerendered > 0) {
      toast({
        title: "Saved · re-rendering recent clips",
        description: `Queued ${result.rerendered} clip${result.rerendered === 1 ? "" : "s"} to re-render with the new corner. Refresh in ~30s.`,
      });
    }
    router.refresh();
  }

  async function redetect() {
    if (pending) return;
    setPending(true);
    const result = await redetectFaceCamCorner(channelId);
    setPending(false);
    if (!result.ok) {
      toast({
        title: "Couldn't re-detect",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Re-detecting…",
      description: "Reading the latest VOD now. Refresh in ~30s.",
    });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Face cam corner
      </span>
      <div className="grid w-fit grid-cols-3 gap-1.5">
        <CornerTile current={current} corner="top_left" onPick={pick} pending={pending} />
        <CornerTile current={current} corner={null} onPick={pick} pending={pending} label="Auto" />
        <CornerTile current={current} corner="top_right" onPick={pick} pending={pending} />
        <div />
        <div />
        <div />
        <CornerTile current={current} corner="bottom_left" onPick={pick} pending={pending} />
        <div />
        <CornerTile current={current} corner="bottom_right" onPick={pick} pending={pending} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {current
          ? `Crops a fixed rectangle in the ${current.replace("_", " ")}.`
          : "Auto-detects from the first few seconds of each clip."}
      </p>
      <button
        type="button"
        onClick={redetect}
        disabled={pending}
        className={cn(
          "rounded border border-border bg-card px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground",
          pending && "cursor-not-allowed opacity-60",
        )}
      >
        Re-detect from VOD
      </button>
    </div>
  );
}

function CornerTile({
  corner,
  current,
  onPick,
  pending,
  label,
}: {
  corner: FaceCamCorner;
  current: FaceCamCorner;
  onPick: (c: FaceCamCorner) => void;
  pending: boolean;
  label?: string;
}) {
  const active = current === corner;
  return (
    <button
      type="button"
      onClick={() => onPick(corner)}
      disabled={pending}
      aria-label={corner ? `Face cam ${corner.replace("_", " ")}` : "Auto-detect"}
      className={cn(
        "flex h-9 w-12 items-center justify-center rounded border text-[10px] font-mono uppercase tracking-[0.14em] transition-colors",
        active
          ? "border-accent bg-accent/20 text-accent"
          : "border-border bg-card hover:border-accent/50",
        pending && "cursor-not-allowed opacity-60",
      )}
    >
      {label ?? (active ? "●" : " ")}
    </button>
  );
}

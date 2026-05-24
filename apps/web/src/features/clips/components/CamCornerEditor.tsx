"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  setClipFaceCamCorner,
  type CamCorner,
} from "../server/setManualCorner";

interface Props {
  clipId: string;
  sourceVideoUrl: string;
  /** What's currently baked into the rendered mp4. */
  currentCorner: CamCorner | null;
  /** Whether the current corner came from the auto-detector or the
   *  user. Drives which preview tile reads as 'auto picked this'. */
  currentSource: string | null;
}

/**
 * Per-clip cam-corner editor. Drops the source video into a 16:9
 * frame with four clickable quadrants overlaid (matching the
 * 22% × 27% preset rectangles the renderer actually crops). Click
 * a quadrant → save → re-render that clip.
 *
 * Scrubbing: video element has `controls`, so the user can pause
 * on a frame where the cam is most visible before deciding.
 */
export function CamCornerEditor({
  clipId,
  sourceVideoUrl,
  currentCorner,
  currentSource,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<CamCorner | null>(
    currentCorner,
  );
  const [pending, setPending] = React.useState(false);

  const dirty = selected !== currentCorner && selected !== null;

  async function save() {
    if (!selected || pending) return;
    setPending(true);
    const result = await setClipFaceCamCorner(clipId, selected);
    setPending(false);
    if (!result.ok) {
      toast({
        title: "Couldn't save",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Saved · re-rendering",
      description: "Refresh in ~30s. The channel default is also updated.",
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Auto-detection picks the cam corner from the first few frames.
        It misses sometimes (game UI looks like a webcam to vision
        models). Click the corner the streamer&apos;s face cam is in,
        then save to re-render this clip with the correct region.
      </p>

      {/* ── Source frame with 4 overlay quadrants ──────────────── */}
      <div className="relative mx-auto w-full max-w-2xl">
        <div className="relative overflow-hidden rounded-md border border-border bg-black">
          <video
            src={sourceVideoUrl}
            controls
            muted
            playsInline
            className="block aspect-video w-full"
          />
          {/* Quadrant overlay — pointer-events-none on the video so
              the corner buttons take the clicks. */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0">
            <CornerOverlay
              corner="top_left"
              selected={selected === "top_left"}
              wasAutoPick={
                currentCorner === "top_left" && currentSource !== "manual"
              }
              onPick={setSelected}
            />
            <CornerOverlay
              corner="top_right"
              selected={selected === "top_right"}
              wasAutoPick={
                currentCorner === "top_right" && currentSource !== "manual"
              }
              onPick={setSelected}
            />
            <CornerOverlay
              corner="bottom_left"
              selected={selected === "bottom_left"}
              wasAutoPick={
                currentCorner === "bottom_left" && currentSource !== "manual"
              }
              onPick={setSelected}
            />
            <CornerOverlay
              corner="bottom_right"
              selected={selected === "bottom_right"}
              wasAutoPick={
                currentCorner === "bottom_right" && currentSource !== "manual"
              }
              onPick={setSelected}
            />
          </div>
        </div>
        {selected ? (
          <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Will crop the{" "}
            <span className="text-foreground">{selected.replace("_", " ")}</span>{" "}
            region into the cam band.
          </p>
        ) : null}
      </div>

      {/* ── Action row ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {currentSource === "manual" ? (
            <span className="inline-flex items-center gap-1 text-foreground">
              <Check className="h-3 w-3 text-mint" /> Manually set
            </span>
          ) : currentCorner ? (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-accent" /> Currently auto-picked:{" "}
              <span className="text-foreground">
                {currentCorner.replace("_", " ")}
              </span>
            </span>
          ) : (
            <span>No corner set — auto-detection didn&apos;t converge.</span>
          )}
        </div>
        <Button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="bg-accent text-accent-foreground hover:bg-accent/90 disabled:bg-accent/30"
        >
          {pending
            ? "Re-rendering…"
            : dirty
              ? "Save & re-render"
              : "No change"}
        </Button>
      </div>
    </div>
  );
}

function CornerOverlay({
  corner,
  selected,
  wasAutoPick,
  onPick,
}: {
  corner: CamCorner;
  selected: boolean;
  wasAutoPick: boolean;
  onPick: (corner: CamCorner) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(corner)}
      aria-label={`Set cam corner to ${corner.replace("_", " ")}`}
      className={cn(
        "pointer-events-auto group flex items-center justify-center transition-colors",
        // Visual: outline-only by default; filled when selected.
        selected
          ? "bg-accent/30 ring-2 ring-inset ring-accent"
          : wasAutoPick
            ? "bg-foreground/[0.04] ring-1 ring-inset ring-foreground/30 hover:bg-accent/15"
            : "hover:bg-accent/15",
      )}
    >
      <span
        className={cn(
          "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] backdrop-blur-sm transition-all",
          selected
            ? "bg-accent text-accent-foreground"
            : "bg-background/70 text-foreground opacity-0 group-hover:opacity-100",
        )}
      >
        {selected ? "✓ " : ""}
        {corner.replace("_", " ")}
      </span>
    </button>
  );
}

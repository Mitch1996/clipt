"use client";

import * as React from "react";
import { Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ClipPlayerProps {
  src: string;
  poster?: string | null;
  className?: string;
  /**
   * When true, hide the unmute affordance and don't autoplay. Used by the
   * minimal embed surface where chrome is unwanted.
   */
  minimal?: boolean;
}

export function ClipPlayer({
  src,
  poster,
  className,
  minimal,
}: ClipPlayerProps) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = React.useState(true);

  const toggleMute = React.useCallback(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted && v.paused) void v.play().catch(() => {});
  }, []);

  return (
    <div
      className={cn(
        "relative aspect-[9/16] w-full overflow-hidden rounded-md border border-border bg-black",
        className,
      )}
    >
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        className="h-full w-full object-contain"
        autoPlay
        muted
        loop
        playsInline
        controls={!minimal}
        preload="metadata"
      />
      {!minimal && muted && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white backdrop-blur transition-colors hover:bg-black/85"
          aria-label="Unmute"
        >
          <VolumeX className="h-3.5 w-3.5" />
          tap to unmute
        </button>
      )}
      {!minimal && !muted && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1.5 text-white backdrop-blur transition-colors hover:bg-black/85"
          aria-label="Mute"
        >
          <Volume2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

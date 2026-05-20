import Image from "next/image";
import Link from "next/link";
import { Film, Plus, Tv } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { StatusPill } from "./StatusPill";
import type { MyClipRow } from "../server/listMyClips";

export interface MyClipsGridProps {
  clips: MyClipRow[];
}

export function MyClipsGrid({ clips }: MyClipsGridProps) {
  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-md border border-dashed border-border bg-card/40 px-6 py-14 text-center">
        <Film
          className="h-8 w-8 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h3 className="mt-4 text-base font-semibold tracking-[-0.01em]">
          No clips yet
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Paste a Twitch, YouTube, or Kick clip URL and we&rsquo;ll handle the
          rest — download, transcribe, reframe, sign attribution.
        </p>
        <Button asChild className="mt-5">
          <Link href="/dashboard/clips/new">
            <Plus className="mr-1 h-3.5 w-3.5" />
            New clip
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {clips.map((clip) => (
        <ClipCard key={clip.id} clip={clip} />
      ))}
    </div>
  );
}

function ClipCard({ clip }: { clip: MyClipRow }) {
  const title = clip.title?.trim()
    ? clip.title
    : clip.source_platform
      ? `${capitalize(clip.source_platform)} clip`
      : "Clip";

  return (
    <Link
      href={`/dashboard/clips/${clip.id}`}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-accent/40"
    >
      <div className="relative aspect-[9/16] bg-secondary">
        {clip.thumbnailUrl ? (
          <Image
            src={clip.thumbnailUrl}
            alt={title}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <PlatformGlyph platform={clip.source_platform} />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <StatusPill status={clip.status} />
        </div>
        {clip.duration_seconds ? (
          <div className="absolute bottom-2 right-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] tnum text-foreground backdrop-blur-sm">
            {formatDuration(clip.duration_seconds)}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug tracking-[-0.005em]">
          {title}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {formatRelative(clip.created_at)}
        </p>
      </div>
    </Link>
  );
}

function PlatformGlyph({ platform }: { platform: string | null }) {
  // Tiny brand-agnostic placeholder so the empty thumbnail isn't a void.
  if (platform === "twitch") {
    return <Tv className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />;
  }
  return <Film className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

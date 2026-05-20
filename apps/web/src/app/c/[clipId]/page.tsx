import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/shared/Logo";
import { Separator } from "@/components/ui/separator";
import { AttributionBadge } from "@/features/clips/components/AttributionBadge";
import { ClipPlayer } from "@/features/clips/components/ClipPlayer";
import { EmbedCodeButton } from "@/features/clips/components/EmbedCodeButton";
import { RecordView } from "@/features/clips/components/RecordView";
import { ShareButton } from "@/features/clips/components/ShareButton";
import {
  type PublicClipData,
  type PublicProfile,
  getPublicClip,
} from "@/features/clips/server/getPublicClip";

export const revalidate = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clipt.live";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clipId: string }>;
}): Promise<Metadata> {
  const { clipId } = await params;
  const clip = await getPublicClip(clipId);
  if (!clip) return { title: "Clip not found — Clipt" };

  const description =
    clip.captionPreview?.slice(0, 150) ??
    `A clip${
      clip.sourceCreator ? ` from @${clip.sourceCreator.handle}` : ""
    } on Clipt.`;
  const canonical = `${APP_URL}/c/${clip.id}`;
  const title = `${clip.title} — Clipt`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "video.other",
      title,
      description,
      url: canonical,
      siteName: "Clipt",
      images: clip.thumbnailUrl ? [{ url: clip.thumbnailUrl }] : undefined,
      videos: [
        {
          url: clip.videoUrl,
          type: "video/mp4",
          width: 1080,
          height: 1920,
        },
      ],
    },
    twitter: {
      card: "player",
      title,
      description,
      images: clip.thumbnailUrl ? [clip.thumbnailUrl] : undefined,
      players: [
        {
          playerUrl: `${APP_URL}/c/${clip.id}/embed`,
          streamUrl: clip.videoUrl,
          width: 1080,
          height: 1920,
        },
      ],
    },
  };
}

export default async function PublicClipPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clipId } = await params;
  const clip = await getPublicClip(clipId);
  if (!clip) notFound();

  const shareUrl = `${APP_URL}/c/${clip.id}`;
  const embedUrl = `${APP_URL}/c/${clip.id}/embed`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <RecordView clipId={clip.id} />
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <Logo className="h-6" />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <ShareButton url={shareUrl} title={clip.title} />
            <EmbedCodeButton embedUrl={embedUrl} />
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-10 md:grid-cols-[auto,1fr] md:py-16">
        <ClipPlayer
          src={clip.videoUrl}
          poster={clip.thumbnailUrl}
          className="mx-auto w-full max-w-[300px] md:w-[300px]"
        />

        <div className="min-w-0 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
              {clip.title}
            </h1>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {formatViewCount(clip.viewCount)} • {formatDate(clip.createdAt)}
            </p>
          </div>

          <AttributionPanel
            sourceCreator={clip.sourceCreator}
            clipper={clip.clipper}
            attribution={clip.attribution}
            attributionToken={clip.attributionToken}
          />

          {clip.captionPreview && (
            <p className="border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground">
              {clip.captionPreview.slice(0, 320)}
              {clip.captionPreview.length > 320 && "…"}
            </p>
          )}
        </div>
      </main>

      <footer className="mt-20 border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span>
            Clipped on{" "}
            <Link href="/" className="text-foreground hover:underline">
              Clipt
            </Link>{" "}
            — every clip pays the creator.
          </span>
          <Link href="/" className="hover:text-foreground">
            clipt.live
          </Link>
        </div>
      </footer>
    </div>
  );
}

function AttributionPanel({
  sourceCreator,
  clipper,
  attribution,
  attributionToken,
}: {
  sourceCreator: PublicClipData["sourceCreator"];
  clipper: PublicClipData["clipper"];
  attribution: PublicClipData["attribution"];
  attributionToken: PublicClipData["attributionToken"];
}) {
  const showClipper =
    clipper && (!sourceCreator || clipper.id !== sourceCreator.id);

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-5">
      {sourceCreator ? (
        <Row
          label="Originally streamed by"
          profile={sourceCreator}
        />
      ) : (
        <Row label="Originally streamed by" plain="(unconnected channel)" />
      )}

      {showClipper && <Row label="Clipped by" profile={clipper} />}

      {attribution && attributionToken && (
        <>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Cryptographic proof of origin
            </span>
            <AttributionBadge
              attribution={attribution}
              token={attributionToken}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  profile,
  plain,
}: {
  label: string;
  profile?: PublicProfile;
  plain?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {profile ? (
        <Link
          href={`/@${profile.handle}`}
          className="truncate text-sm font-medium hover:underline"
        >
          @{profile.handle}
          {profile.displayName ? (
            <span className="ml-2 text-muted-foreground">
              {profile.displayName}
            </span>
          ) : null}
        </Link>
      ) : (
        <span className="truncate text-sm text-muted-foreground">{plain}</span>
      )}
    </div>
  );
}

function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  if (n === 1) return "1 view";
  return `${n} views`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

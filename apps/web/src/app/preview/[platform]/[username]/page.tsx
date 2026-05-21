import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Radio, Sparkles } from "lucide-react";

import { Logo } from "@/components/shared/Logo";
import { StorageKeys, getSignedDownloadUrl } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 60;

interface PreviewPageProps {
  params: Promise<{ platform: string; username: string }>;
}

export async function generateMetadata({
  params,
}: PreviewPageProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} — Clipt preview`,
    description: `A private preview of automatically generated vertical clips from @${username}'s stream.`,
    robots: { index: false, follow: false }, // private link — keep out of search
  };
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { platform, username } = await params;
  if (platform !== "twitch") notFound();

  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("id, platform_username, is_live, last_live_at")
    .eq("platform", "twitch")
    .ilike("platform_username", username)
    .maybeSingle();
  if (!channel) notFound();

  // Pull every ready clip Clipt has captured from this channel. These
  // are the auto-clips that fired from chat-spike + audio-yell events
  // while their stream was live.
  const { data: clipRows } = await admin
    .from("clips")
    .select(
      "id, title, duration_seconds, created_at, source_kind, vertical_video_r2_key",
    )
    .eq("source_channel_id", channel.id)
    .eq("status", "ready")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(24);

  const clips = await Promise.all(
    (clipRows ?? []).map(async (row) => {
      let thumbnailUrl: string | null = null;
      try {
        thumbnailUrl = await getSignedDownloadUrl(
          StorageKeys.thumbnail(row.id),
          3600,
        );
      } catch {
        // No thumbnail (rare — reframe failed mid-way). Card will use
        // a platform-glyph placeholder.
      }
      return { ...row, thumbnailUrl };
    }),
  );

  // Hero pick: most recent auto-detected hype-moment clip — that's the
  // one with the biggest "wow they really caught my moment" punch. Fall
  // back to the most recent ready clip of any source_kind.
  const heroRow =
    (clipRows ?? []).find((r) => r.source_kind === "live_auto") ??
    (clipRows ?? [])[0] ??
    null;
  const heroVideoUrl = heroRow
    ? await getSignedDownloadUrl(
        heroRow.vertical_video_r2_key ?? StorageKeys.vertical(heroRow.id),
        3600,
      ).catch(() => null)
    : null;
  const heroThumbnailUrl = heroRow
    ? clips.find((c) => c.id === heroRow.id)?.thumbnailUrl ?? null
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <Logo className="h-6" />
          </Link>
          <Link
            href="/auth/signup"
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            Sign up →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          <Sparkles className="h-3 w-3" />
          Private preview
        </span>

        <h1 className="mt-5 text-4xl font-bold tracking-[-0.03em] md:text-6xl">
          Hey <span className="text-accent">@{channel.platform_username}</span> —
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-snug text-muted-foreground md:text-xl">
          we&rsquo;ve been quietly clipping your hype moments. Every vertical
          below was generated automatically from your last live stream —
          captioned, reframed to 9:16, and cryptographically signed so the
          attribution travels with the file wherever you post it.
        </p>

        {channel.is_live ? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/[0.06] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-destructive">
            <Radio className="h-3 w-3 animate-pulse" />
            You&rsquo;re live right now — new clips will appear here within a
            minute
          </div>
        ) : channel.last_live_at ? (
          <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Last stream: {new Date(channel.last_live_at).toLocaleString()}
          </div>
        ) : null}

        {heroVideoUrl && heroRow ? (
          <div className="mt-10 grid gap-8 md:grid-cols-[300px,1fr]">
            <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-md border border-border bg-black md:mx-0">
              <video
                src={heroVideoUrl}
                poster={heroThumbnailUrl ?? undefined}
                autoPlay
                muted
                loop
                playsInline
                controls
                className="aspect-[9/16] w-full"
              />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground backdrop-blur-sm">
                {heroRow.source_kind === "live_auto" ? "Auto-detected" : "Latest"}
              </span>
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                We found this one
              </span>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.01em] md:text-3xl">
                {heroRow.title ?? `Hype moment from @${channel.platform_username}`}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Our chat-spike + audio-energy detector picked this out of
                your stream{" "}
                {heroRow.created_at
                  ? new Date(heroRow.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : ""}
                . Captioned, reframed to 9:16, signed with cryptographic
                attribution that travels with the file.
              </p>
              <Link
                href={`/c/${heroRow.id}`}
                target="_blank"
                className="mt-4 inline-flex w-fit items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground hover:text-accent"
              >
                Open the public clip page →
              </Link>
            </div>
          </div>
        ) : null}

        {clips.length === 0 ? (
          <div className="mt-12 rounded-md border border-dashed border-border bg-card/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No auto-clips yet — we just started watching this channel. The
              next time you go live, the chat-spike + audio detectors will
              do their thing and the clips will land here.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mt-12 text-xl font-semibold tracking-[-0.01em]">
              {heroRow ? "More clips from your stream" : "Your auto-generated clips"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap any card to watch the full thing.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {clips.map((c) => (
                <ClipCard key={c.id} clip={c} />
              ))}
            </div>
          </>
        )}

        <div className="mt-16 rounded-md border border-accent/40 bg-accent/[0.06] p-6 md:p-8">
          <h3 className="text-xl font-bold tracking-[-0.02em] md:text-2xl">
            Want them under your control?
          </h3>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Sign up, connect your Twitch, and these clips (plus every future
            hype moment) live in <em>your</em> dashboard. Edit, publish to
            Shorts in one tap, and when monetisation ships every clip pays
            you directly.
          </p>
          <Link
            href={`/auth/signup?next=/dashboard`}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-transform hover:scale-[1.02] active:scale-95"
          >
            Claim my clips
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}

function ClipCard({
  clip,
}: {
  clip: {
    id: string;
    title: string | null;
    duration_seconds: number | null;
    source_kind: string | null;
    thumbnailUrl: string | null;
  };
}) {
  const reasonLabel =
    clip.source_kind === "live_auto" ? "Auto" :
    clip.source_kind === "live_fan" ? "Fan tap" :
    "Clip";
  return (
    <Link
      href={`/c/${clip.id}`}
      target="_blank"
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-accent/40"
    >
      <div className="relative aspect-[9/16] bg-secondary">
        {clip.thumbnailUrl ? (
          <Image
            src={clip.thumbnailUrl}
            alt={clip.title ?? "Auto-generated clip"}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            (thumb missing)
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground backdrop-blur-sm">
          {reasonLabel}
        </span>
        {clip.duration_seconds ? (
          <span className="absolute bottom-2 right-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] tnum text-foreground backdrop-blur-sm">
            {Math.floor(clip.duration_seconds / 60)}:
            {String(Math.round(clip.duration_seconds % 60)).padStart(2, "0")}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug tracking-[-0.005em]">
          {clip.title ?? "Untitled clip"}
        </p>
      </div>
    </Link>
  );
}

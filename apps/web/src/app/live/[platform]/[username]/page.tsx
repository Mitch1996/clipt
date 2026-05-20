import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Radio } from "lucide-react";

import { Logo } from "@/components/shared/Logo";
import { LiveClipButton } from "@/features/clips/components/LiveClipButton";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface LivePageProps {
  params: Promise<{ platform: string; username: string }>;
}

export async function generateMetadata({
  params,
}: LivePageProps): Promise<Metadata> {
  const { platform, username } = await params;
  return {
    title: `@${username} — Live on Clipt`,
    description: `Tap to clip the last 30 seconds of @${username}'s stream on ${platform}.`,
    other: {
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-status-bar-style": "black-translucent",
      "mobile-web-app-capable": "yes",
    },
  };
}

const SUPPORTED_PLATFORMS = ["twitch", "youtube", "kick"] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export default async function LiveViewerPage({ params }: LivePageProps) {
  const { platform, username } = await params;
  if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) notFound();

  // We use the admin client because the viewer might be anonymous —
  // and channels has public-readable rows for the lightweight info we
  // surface here (no token columns). RLS would also allow anon to read
  // these, but admin sidesteps any future tightening.
  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("id, platform_username, is_live, last_live_at, owner_id")
    .eq("platform", platform)
    .ilike("platform_username", username)
    .maybeSingle();

  // Check viewer auth via the SSR-cookie client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthed = !!user;

  const channelConnected = !!channel;
  const isLive = !!channel?.is_live;
  const embedHost = "embed.clipt.live"; // any host works — Twitch only validates origin

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center">
            <Logo className="h-6" />
          </Link>
          <Link
            href="/dashboard"
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-4 pb-32">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-[-0.02em] md:text-3xl">
            @{username}
          </h1>
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
              <Radio className="h-3 w-3 animate-pulse" />
              Live now
            </span>
          ) : channelConnected ? (
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Offline
            </span>
          ) : null}
        </div>

        {!channelConnected ? (
          <div className="rounded-md border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
            @{username} hasn&rsquo;t connected their channel to Clipt yet — so
            we&rsquo;re not buffering their stream. Tell them about{" "}
            <Link href="/" className="text-foreground hover:underline">
              clipt.live
            </Link>{" "}
            and the &ldquo;Connect channel&rdquo; flow.
          </div>
        ) : (
          <div className="aspect-video overflow-hidden rounded-md border border-border bg-black">
            {platform === "twitch" ? (
              <iframe
                src={`https://player.twitch.tv/?channel=${encodeURIComponent(username)}&parent=clipt.live&parent=www.clipt.live&parent=${embedHost}&muted=false`}
                allowFullScreen
                className="h-full w-full"
                title={`${username} live`}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {platform} embed coming in 2.x
              </div>
            )}
          </div>
        )}

        {channelConnected && !isLive ? (
          <p className="text-sm text-muted-foreground">
            @{username} isn&rsquo;t live right now. Come back when the
            &ldquo;Live now&rdquo; badge lights up — the clip button captures
            from a 5-minute rolling buffer that only exists while they&rsquo;re
            streaming.
          </p>
        ) : null}
      </main>

      {/* Sticky bottom action — survives chat / scroll, big enough to
          thumb-tap mid-stream. Hidden when channel isn't connected. */}
      {channelConnected ? (
        <div className="pointer-events-none sticky bottom-0 z-10 mx-auto w-full max-w-3xl px-4 pb-6 pt-4">
          <div
            className="pointer-events-auto"
            style={{
              paddingBottom: "max(0px, env(safe-area-inset-bottom))",
            }}
          >
            <LiveClipButton
              platform={platform as Platform}
              channelLogin={username}
              label={channel.platform_username ?? username}
              isLive={isLive}
              isAuthed={isAuthed}
              signInHref={`/auth/login?next=/live/${platform}/${username}`}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic"; // channel.is_live changes every 30s

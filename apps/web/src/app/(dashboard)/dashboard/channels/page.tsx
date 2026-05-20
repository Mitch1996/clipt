import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChannelsCallbackToast } from "@/features/channels/components/ChannelsCallbackToast";
import {
  ConnectChannelButton,
  type ChannelPlatform,
} from "@/features/channels/components/ConnectChannelButton";
import { DisconnectButton } from "@/features/channels/components/DisconnectButton";
import { isInstagramConfigured } from "@/features/channels/server/instagram";
import { isTikTokConfigured } from "@/features/channels/server/tiktok";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const metadata = {
  title: "Channels — Clipt",
};

type Channel = Database["public"]["Tables"]["channels"]["Row"];

interface PlatformTile {
  key: ChannelPlatform;
  label: string;
  cta: string;
  blurb: string;
  /** Render the Connect button at all? false = "Coming soon" tile. */
  available: boolean;
  /** Per-tile note explaining why it's not available, if relevant. */
  note?: string;
}

function platformTiles(): PlatformTile[] {
  return [
    {
      key: "twitch",
      label: "Twitch",
      cta: "Connect Twitch",
      blurb: "Pull source clips, list VODs, and authenticate live-stream access.",
      available: true,
    },
    {
      key: "youtube",
      label: "YouTube",
      cta: "Connect YouTube",
      blurb: "Source long-form videos and post Shorts back to the channel.",
      available: true,
    },
    {
      key: "tiktok",
      label: "TikTok",
      cta: isTikTokConfigured() ? "Connect TikTok" : "Coming soon",
      blurb: "Post vertical clips as TikTok videos.",
      available: isTikTokConfigured(),
      note: isTikTokConfigured()
        ? undefined
        : "Add TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET in .env.local. Sandbox accounts can post without app-audit; production needs the Content Posting API approved.",
    },
    {
      key: "instagram",
      label: "Instagram",
      cta: isInstagramConfigured() ? "Connect Instagram" : "Coming soon",
      blurb: "Post Reels via the Meta Graph API.",
      available: isInstagramConfigured(),
      note: isInstagramConfigured()
        ? "Posting Reels needs an IG Business / Creator account linked to a Facebook Page you manage."
        : "Add INSTAGRAM_CLIENT_ID + INSTAGRAM_CLIENT_SECRET in .env.local. Meta app review can take days for instagram_content_publish.",
    },
    {
      key: "kick",
      label: "Kick",
      cta: "Coming soon",
      blurb: "Live + clip sourcing once Kick OAuth lands in Phase 2.",
      available: false,
    },
  ];
}

export default async function ChannelsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("channels")
    .select(
      "id, platform, platform_username, scopes, connected_at, last_synced_at, access_token_encrypted",
    )
    .order("connected_at", { ascending: false });

  const channels = (rows ?? []) as Channel[];
  const tiles = platformTiles();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={null}>
        <ChannelsCallbackToast />
      </Suspense>

      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Dashboard / channels
      </span>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
        Connect your channels.
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        We exchange and encrypt your tokens at rest with AES-256-GCM. Disconnect
        any time — historical clips stay.
      </p>

      <Separator className="my-10" />

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((p) => {
          const row = channels.find(
            (c) => c.platform === p.key && c.access_token_encrypted,
          );
          const connected = !!row;
          return (
            <div key={p.key} className="flex flex-col bg-background p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {p.label}
                </span>
                {connected ? (
                  <Badge variant="outline" className="border-mint/40 bg-mint/10 text-mint">
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {p.available ? "Not connected" : "Soon"}
                  </Badge>
                )}
              </div>

              <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.blurb}</p>

              {p.note && !connected && (
                <p className="mt-3 text-xs text-muted-foreground/80">{p.note}</p>
              )}

              {connected && row ? (
                <div className="mt-6 space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Account: </span>
                    <span className="font-medium">
                      @{row.platform_username ?? "unknown"}
                    </span>
                  </div>
                  {row.scopes && row.scopes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {row.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      connected{" "}
                      {row.connected_at
                        ? new Date(row.connected_at).toLocaleDateString()
                        : "—"}
                    </span>
                    <DisconnectButton
                      channelId={row.id}
                      channelLabel={`${p.label} @${row.platform_username ?? "unknown"}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-6">
                  <ConnectChannelButton
                    platform={p.key}
                    alreadyConnected={false}
                    disabled={!p.available}
                  >
                    {p.cta}
                  </ConnectChannelButton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

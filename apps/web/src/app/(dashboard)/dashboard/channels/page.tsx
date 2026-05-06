import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChannelsCallbackToast } from "@/features/channels/components/ChannelsCallbackToast";
import { ConnectChannelButton } from "@/features/channels/components/ConnectChannelButton";
import { DisconnectButton } from "@/features/channels/components/DisconnectButton";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const metadata = {
  title: "Channels — Clipt",
};

type Channel = Database["public"]["Tables"]["channels"]["Row"];

const PLATFORMS = [
  {
    key: "twitch" as const,
    label: "Twitch",
    cta: "Connect Twitch",
    blurb: "Pull source clips, list VODs, and authenticate live-stream access.",
    available: true,
  },
  {
    key: "youtube" as const,
    label: "YouTube",
    cta: "Connect YouTube",
    blurb: "Source long-form videos and post Shorts back to the channel.",
    available: true,
  },
  {
    key: "kick" as const,
    label: "Kick",
    cta: "Coming soon",
    blurb: "Live + clip sourcing once Kick OAuth lands in Phase 2.",
    available: false,
  },
];

export default async function ChannelsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("channels")
    .select(
      "id, platform, platform_username, scopes, connected_at, last_synced_at, access_token_encrypted",
    )
    .order("connected_at", { ascending: false });

  const channels = (rows ?? []) as Channel[];

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
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

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
        {PLATFORMS.map((p) => {
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

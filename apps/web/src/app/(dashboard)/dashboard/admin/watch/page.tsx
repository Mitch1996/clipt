import { notFound, redirect } from "next/navigation";
import { Radio, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FaceCamCornerPicker } from "@/features/channels/components/FaceCamCornerPicker";
import { WatchChannelForm } from "@/features/channels/components/WatchChannelForm";
import type { FaceCamCorner } from "@/features/channels/server/setFaceCamCorner";
import {
  listWatchOnlyChannels,
  type WatchOnlyChannel,
} from "@/features/channels/server/watch";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin · Watch — Clipt" };
// Channel live-state updates every ~30s via the live worker scheduler.
// Don't statically cache the page or the dashboard reads stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clipt.live";

export default async function WatchChannelsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/watch");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") notFound();

  const channels = await listWatchOnlyChannels();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Admin / watch
      </span>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
        Watch-only channels
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Add a Twitch streamer here to start the live worker buffering their
        stream + auto-clipping hype moments — without them needing to sign
        up first. Generated clips land in your dashboard and on a private
        preview URL you can share with them for the pitch.
      </p>

      <div className="mt-8 rounded-md border border-border bg-card p-5">
        <WatchChannelForm />
      </div>

      <h2 className="mt-12 text-lg font-semibold tracking-[-0.01em]">
        Watching ({channels.length})
      </h2>
      {channels.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
          None yet. Add a Twitch login above to start watching.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {channels.map((c) => (
            <Row key={c.id} channel={c} appUrl={APP_URL} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  channel: c,
  appUrl,
}: {
  channel: WatchOnlyChannel;
  appUrl: string;
}) {
  const previewUrl = `${appUrl}/preview/twitch/${c.platform_username ?? ""}`;
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold tracking-[-0.005em]">
            @{c.platform_username}
          </span>
          {c.is_live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
              <Radio className="h-2.5 w-2.5 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Offline
            </span>
          )}
        </div>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {c.clipCount} clip{c.clipCount === 1 ? "" : "s"}
          {c.last_live_at ? (
            <>
              {" · "}
              last live{" "}
              {new Date(c.last_live_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </>
          ) : null}
        </p>
        <a
          href={previewUrl}
          className="mt-2 inline-block break-all font-mono text-[11px] text-accent hover:underline"
        >
          {previewUrl}
        </a>
        <div className="mt-4">
          <FaceCamCornerPicker
            channelId={c.id}
            current={(c.face_cam_corner ?? null) as FaceCamCorner}
          />
        </div>
      </div>
      <form
        action={async () => {
          "use server";
          const { removeWatchOnlyChannel } = await import(
            "@/features/channels/server/watch"
          );
          await removeWatchOnlyChannel(c.id);
        }}
      >
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Remove
        </Button>
      </form>
    </li>
  );
}

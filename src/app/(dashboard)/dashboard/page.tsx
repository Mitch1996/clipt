import Link from "next/link";
import { ArrowRight, Tv } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard — Clipt",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, display_name, role")
    .eq("id", user!.id)
    .single();

  const { count: connectedChannels } = await supabase
    .from("channels")
    .select("id", { count: "exact", head: true })
    .not("access_token_encrypted", "is", null);

  const handle = profile?.handle ?? "user";

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Dashboard
      </span>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
        Hello, <span className="text-accent">@{handle}</span>.
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Your role is{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs uppercase tracking-wider text-foreground">
          {profile?.role ?? "creator"}
        </span>
        . Real dashboards land in upcoming prompts; for now you can connect a
        channel.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link
          href="/dashboard/channels"
          className="group flex flex-col rounded-md border border-border bg-card p-6 transition-colors hover:border-accent/40"
        >
          <div className="flex items-center justify-between">
            <Tv className="h-6 w-6 text-accent" strokeWidth={1.75} />
            <span className="tnum font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {connectedChannels ?? 0} connected
            </span>
          </div>
          <h2 className="mt-6 text-lg font-semibold tracking-[-0.01em]">
            Connect channels
          </h2>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            Twitch, YouTube, and Kick. We encrypt tokens at rest and refresh
            them on demand.
          </p>
          <div className="mt-4 inline-flex items-center gap-1 text-sm text-foreground transition-colors group-hover:text-accent">
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </Link>

        <div className="flex flex-col rounded-md border border-dashed border-border bg-card/40 p-6">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Coming next
          </span>
          <h2 className="mt-6 text-lg font-semibold tracking-[-0.01em]">
            New clip from URL
          </h2>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            Paste a Twitch / YouTube / Kick URL and let the pipeline produce a
            vertical, captioned, attribution-signed short. Lands in Prompt 1.5.
          </p>
          <Button disabled variant="outline" className="mt-4 w-fit">
            Soon
          </Button>
        </div>
      </div>
    </div>
  );
}

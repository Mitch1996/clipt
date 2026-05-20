import Link from "next/link";
import { ArrowRight, CreditCard, Plus, Tv } from "lucide-react";

import { getEntitlements } from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/billing/plans";
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

  const ent = await getEntitlements(user!.id);
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

        <Link
          href="/dashboard/clips/new"
          className="group flex flex-col rounded-md border border-border bg-card p-6 transition-colors hover:border-accent/40"
        >
          <div className="flex items-center justify-between">
            <Plus className="h-6 w-6 text-accent" strokeWidth={1.75} />
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              ⌘N
            </span>
          </div>
          <h2 className="mt-6 text-lg font-semibold tracking-[-0.01em]">
            New clip from URL
          </h2>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            Paste a Twitch / YouTube / Kick URL — we&rsquo;ll pull, transcribe,
            reframe, and sign attribution.
          </p>
          <div className="mt-4 inline-flex items-center gap-1 text-sm text-foreground transition-colors group-hover:text-accent">
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </Link>
      </div>

      <Link
        href="/dashboard/billing"
        className="group mt-6 flex items-center justify-between rounded-md border border-border bg-card p-6 transition-colors hover:border-accent/40"
      >
        <div className="flex items-start gap-4">
          <CreditCard className="mt-1 h-6 w-6 text-accent" strokeWidth={1.75} />
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.01em]">
              {PLANS[ent.effectiveTier].name} plan
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ent.monthlyClipLimit === null ? (
                <>
                  <span className="text-foreground tnum">
                    {ent.clipsThisMonth}
                  </span>{" "}
                  clip{ent.clipsThisMonth === 1 ? "" : "s"} this month · unlimited
                </>
              ) : (
                <>
                  <span className="text-foreground tnum">
                    {ent.clipsThisMonth}
                  </span>{" "}
                  /{" "}
                  <span className="tnum">{ent.monthlyClipLimit}</span> clips this
                  month
                  {ent.clipsRemaining === 0 ? (
                    <span className="ml-2 text-destructive">limit reached</span>
                  ) : null}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 text-sm text-foreground transition-colors group-hover:text-accent">
          {ent.effectiveTier === "free" ? "Upgrade" : "Manage"}
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </Link>
    </div>
  );
}

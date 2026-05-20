import Link from "next/link";
import { ArrowRight, CreditCard, Plus, Sparkles, Tv } from "lucide-react";

import { MyClipsGrid } from "@/features/clips/components/MyClipsGrid";
import { MyClipsRealtimeRefresh } from "@/features/clips/components/MyClipsRealtimeRefresh";
import { listMyClips } from "@/features/clips/server/listMyClips";
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

  const [ent, clips] = await Promise.all([
    getEntitlements(user!.id),
    listMyClips(24),
  ]);
  const handle = profile?.handle ?? "user";
  const isFirstRun = (connectedChannels ?? 0) === 0 && clips.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
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
        . Connect a channel, paste a URL, ship a clip.
      </p>

      {isFirstRun ? (
        <div className="mt-8 rounded-md border border-accent/30 bg-accent/[0.04] p-5">
          <div className="flex items-start gap-3">
            <Sparkles
              className="mt-0.5 h-5 w-5 shrink-0 text-accent"
              strokeWidth={1.75}
            />
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-[-0.01em]">
                First time on Clipt? Two ways in.
              </h2>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                    01
                  </span>{" "}
                  <Link
                    href="/dashboard/channels"
                    className="font-medium text-foreground hover:underline"
                  >
                    Connect your channel
                  </Link>{" "}
                  to earn when fans clip your stream — attribution + payouts
                  route back to you automatically.
                </li>
                <li>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                    02
                  </span>{" "}
                  <Link
                    href="/dashboard/clips/new"
                    className="font-medium text-foreground hover:underline"
                  >
                    Paste a URL
                  </Link>{" "}
                  from any Twitch / YouTube / Kick clip to make your own
                  vertical export — no channel connection needed.
                </li>
              </ol>
            </div>
          </div>
        </div>
      ) : null}

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
            Link Twitch / YouTube / Kick so clips of your stream credit you
            and earnings route back automatically.
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

      <div className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            Recent clips
          </h2>
          <Link
            href="/dashboard/clips/new"
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-accent"
          >
            New clip →
          </Link>
        </div>
        <div className="mt-5">
          <MyClipsGrid clips={clips} />
        </div>
        <MyClipsRealtimeRefresh userId={user!.id} />
      </div>

      <Link
        href="/dashboard/billing"
        className="group mt-12 flex flex-col gap-3 rounded-md border border-border bg-card p-6 transition-colors hover:border-accent/40 sm:flex-row sm:items-center sm:justify-between"
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

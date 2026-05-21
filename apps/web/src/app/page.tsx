import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Clapperboard,
  Radio,
  Sparkles,
  Tv,
  Users,
  Wallet,
} from "lucide-react";

import { Logo } from "@/components/shared/Logo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { WaitlistForm } from "@/features/waitlist/components/WaitlistForm";
import { PLANS } from "@/lib/billing/plans";
import { StorageKeys, getSignedDownloadUrl } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Clipt — Every clip pays the creator",
  description:
    "Live AI clipping, vertical reframe, cryptographic attribution, automatic payouts. One product, four wallets.",
};

// Marketing page polls the DB at render time. Cache for a minute so we
// don't hammer Supabase on every visit while still showing fresh counts.
export const revalidate = 60;

type HeroClip = {
  id: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  channelHandle: string | null;
  createdAt: string | null;
};

type FirstPartyStats = {
  channelsWatching: number;
  autoClipsThisWeek: number;
  totalReadyClips: number;
  hoursCaptured: number;
};

async function loadHomepageData(): Promise<{
  heroClip: HeroClip | null;
  stats: FirstPartyStats;
}> {
  const fallback: FirstPartyStats = {
    channelsWatching: 0,
    autoClipsThisWeek: 0,
    totalReadyClips: 0,
    hoursCaptured: 0,
  };
  try {
    const admin = createAdminClient();

    // Hero clip: most recent auto-detected live clip with a vertical
    // export. Live-auto wins over fan-tap wins over paste-URL.
    const { data: clipRow } = await admin
      .from("clips")
      .select(
        "id, vertical_video_r2_key, created_at, source_channel_id, channels:channels!clips_source_channel_id_fkey(platform_username)",
      )
      .eq("status", "ready")
      .eq("source_kind", "live_auto")
      .not("vertical_video_r2_key", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let heroClip: HeroClip | null = null;
    if (clipRow?.vertical_video_r2_key) {
      const [videoUrl, thumbnailUrl] = await Promise.all([
        getSignedDownloadUrl(clipRow.vertical_video_r2_key, 3600),
        getSignedDownloadUrl(StorageKeys.thumbnail(clipRow.id), 3600).catch(
          () => null,
        ),
      ]);
      heroClip = {
        id: clipRow.id,
        videoUrl,
        thumbnailUrl,
        channelHandle:
          (clipRow.channels as { platform_username: string | null } | null)
            ?.platform_username ?? null,
        createdAt: clipRow.created_at,
      };
    }

    // Stats: queried in parallel.
    const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [channels, autoWeek, totalReady, durations] = await Promise.all([
      admin.from("channels").select("id", { head: true, count: "exact" }),
      admin
        .from("clips")
        .select("id", { head: true, count: "exact" })
        .eq("source_kind", "live_auto")
        .eq("status", "ready")
        .is("deleted_at", null)
        .gte("created_at", weekAgoIso),
      admin
        .from("clips")
        .select("id", { head: true, count: "exact" })
        .eq("status", "ready")
        .is("deleted_at", null),
      admin
        .from("clips")
        .select("duration_seconds")
        .eq("status", "ready")
        .is("deleted_at", null),
    ]);

    const hoursCaptured = Math.round(
      (durations.data ?? []).reduce(
        (sum, r) => sum + (Number(r.duration_seconds) || 0),
        0,
      ) / 3600,
    );

    return {
      heroClip,
      stats: {
        channelsWatching: channels.count ?? 0,
        autoClipsThisWeek: autoWeek.count ?? 0,
        totalReadyClips: totalReady.count ?? 0,
        hoursCaptured,
      },
    };
  } catch (err) {
    console.warn("homepage data load failed:", err);
    return { heroClip: null, stats: fallback };
  }
}

export default async function Home() {
  const { heroClip, stats } = await loadHomepageData();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <Hero heroClip={heroClip} />
        <PersonaGrid />
        <ClipEconomy stats={stats} />
        <HowItWorks />
        <WhyClipt />
        <Pricing />
        <Faq />
        <BottomCta />
      </main>

      <SiteFooter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header / nav
// ─────────────────────────────────────────────────────────────

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo pulse className="h-7" />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#product" className="transition-colors hover:text-foreground">
            Product
          </a>
          <a href="#creators" className="transition-colors hover:text-foreground">
            For creators
          </a>
          <a href="#clippers" className="transition-colors hover:text-foreground">
            For clippers
          </a>
          <a href="#brands" className="transition-colors hover:text-foreground">
            For brands
          </a>
          <a href="#pricing" className="transition-colors hover:text-foreground">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Log in
          </Link>
          <Button
            asChild
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <a href="#waitlist">
              Join waitlist
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────

function Hero({ heroClip }: { heroClip: HeroClip | null }) {
  return (
    <section id="product" className="border-b border-border">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-20 md:py-28 lg:grid-cols-[1.3fr_minmax(0,1fr)] lg:gap-16">
        <div>
          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
            Now onboarding · Wave 01
          </div>

          <h1 className="mt-8 max-w-3xl text-balance font-sans text-[clamp(2.5rem,7vw,5.75rem)] font-black leading-[0.95] tracking-[-0.04em]">
            Every clip pays
            <br />
            the{" "}
            <span className="relative whitespace-nowrap">
              creator
              <span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[0.18em] w-full origin-left bg-accent motion-safe:animate-underline-draw"
              />
            </span>
            .
          </h1>

          <p className="mt-8 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            Live AI clipping, vertical reframe, cryptographic attribution,
            automatic payouts. One product, four wallets.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-accent text-accent-foreground shadow-glow hover:bg-accent/90"
            >
              <a href="#waitlist">
                Join the waitlist
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
            >
              <a href="#how-it-works">
                See how it works
              </a>
            </Button>
          </div>
        </div>

        <div className="motion-safe:animate-fade-up">
          <HeroClipCard heroClip={heroClip} />
        </div>
      </div>
    </section>
  );
}

function HeroClipCard({ heroClip }: { heroClip: HeroClip | null }) {
  // No clip available yet — render an intentional, designed placeholder
  // so the right side never looks empty. Mocks the 9:16 output frame
  // with a hairline-bordered card, a fake caption block, and a corner
  // cam pill.
  if (!heroClip) {
    return (
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-md border border-border bg-card shadow-brand-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--accent)/0.10),transparent_50%)]" />
        {/* Mock face-cam corner */}
        <div className="absolute right-3 top-3 h-16 w-20 rounded border border-border bg-background/80 backdrop-blur-sm">
          <div className="absolute inset-2 rounded-sm bg-gradient-to-br from-accent/30 to-mint/20" />
        </div>
        {/* Mock viral caption */}
        <div className="absolute inset-x-4 bottom-20 flex flex-col items-center gap-2">
          <span className="rounded bg-foreground/90 px-3 py-1 text-center font-black uppercase tracking-tight text-background">
            we just made
          </span>
          <span className="rounded bg-accent px-3 py-1 text-center font-black uppercase tracking-tight text-accent-foreground">
            THIS
          </span>
        </div>
        {/* Attribution badge mock */}
        <div className="absolute inset-x-4 bottom-4 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>@your-channel</span>
          <span className="inline-flex items-center gap-1 text-mint">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
            verified
          </span>
        </div>
        <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent backdrop-blur-sm">
          <Sparkles className="h-2.5 w-2.5" />
          sample output
        </div>
      </div>
    );
  }
  return (
    <Link
      href={`/c/${heroClip.id}`}
      target="_blank"
      className="group block"
      aria-label="Watch the latest auto-detected hype moment"
    >
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-md border border-border bg-black shadow-brand-md transition-transform group-hover:scale-[1.02]">
        <video
          src={heroClip.videoUrl}
          poster={heroClip.thumbnailUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover"
        />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent backdrop-blur-sm">
          <Sparkles className="h-2.5 w-2.5" />
          live auto-clip
        </span>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>
      <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {heroClip.channelHandle ? `@${heroClip.channelHandle} · ` : ""}
        auto-detected hype moment
        {heroClip.createdAt
          ? ` · ${timeAgo(heroClip.createdAt)}`
          : ""}
      </p>
    </Link>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────
// Persona grid (4-up, hover reveals a mock UI fragment)
// ─────────────────────────────────────────────────────────────

function PersonaGrid() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Built for the whole chain.
          </h2>
          <span className="hidden font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground md:inline">
            04 personas
          </span>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          <StreamerCard />
          <FanCard />
          <ClipperCard />
          <BrandCard />
        </div>
      </div>
    </section>
  );
}

function PersonaCardShell({
  id,
  icon: Icon,
  title,
  body,
  children,
}: {
  id: string;
  icon: typeof Tv;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className="group relative flex flex-col gap-4 overflow-hidden bg-background p-6 transition-colors hover:bg-card md:p-8"
    >
      <Icon className="h-7 w-7 text-accent" strokeWidth={1.75} aria-hidden />
      <h3 className="text-lg font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-auto pt-2">{children}</div>
    </div>
  );
}

function StreamerCard() {
  return (
    <PersonaCardShell
      id="creators"
      icon={Tv}
      title="For streamers"
      body="Connect once. Every clip from your stream — fan-made or AI-detected — credits and pays you automatically."
    >
      <div className="rounded border border-border bg-background/60 p-3 transition-shadow group-hover:shadow-brand-md">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Today
        </span>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground">
            Earned
          </span>
          <span className="text-lg font-bold tabular-nums text-mint">€12.40</span>
        </div>
      </div>
    </PersonaCardShell>
  );
}

function FanCard() {
  return (
    <PersonaCardShell
      id="fans"
      icon={Users}
      title="For fans"
      body="Tap to clip the last 30 seconds. Post it anywhere. Your favorite streamer gets the cut they earned."
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent/10 px-3 py-1.5 transition-all group-hover:bg-accent group-hover:text-accent-foreground">
        <span className="inline-flex h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent group-hover:bg-accent-foreground" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
          Tap to clip last 30s
        </span>
      </div>
    </PersonaCardShell>
  );
}

function ClipperCard() {
  return (
    <PersonaCardShell
      id="clippers"
      icon={Clapperboard}
      title="For clippers"
      body="Browse a marketplace of paid campaigns. KYC'd, branded, FTC-compliant by default. Get paid per verified view."
    >
      <div className="rounded border border-border bg-background/60 p-3 transition-shadow group-hover:shadow-brand-md">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
          paid campaign
        </span>
        <p className="mt-1 line-clamp-1 text-xs font-semibold">
          POG moments · @brand
        </p>
        <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>€4 / 1k views</span>
          <span className="text-mint">claim →</span>
        </div>
      </div>
    </PersonaCardShell>
  );
}

function BrandCard() {
  return (
    <PersonaCardShell
      id="brands"
      icon={BadgeCheck}
      title="For brands"
      body="Run clipping campaigns with cryptographic attribution and audit-grade compliance reports. CPM you can verify."
    >
      <div className="flex items-center gap-2 rounded border border-mint/40 bg-mint/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mint transition-colors group-hover:bg-mint/10">
        <Check className="h-3 w-3" strokeWidth={3} />
        <span>FTC-disclosed · audit-ready</span>
      </div>
    </PersonaCardShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Clip economy — first-party stats, with industry fallbacks
// ─────────────────────────────────────────────────────────────

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function ClipEconomy({ stats }: { stats: FirstPartyStats }) {
  // Show first-party numbers when they're non-zero; fall back to
  // industry stats so the section never reads as "0 / 0 / 0" on a
  // fresh dataset.
  const tiles: Array<{
    kicker: string;
    value: string;
    note: string;
    money: boolean;
  }> = [
    stats.channelsWatching > 0
      ? {
          kicker: "Channels watching",
          value: formatStat(stats.channelsWatching),
          note: "and counting",
          money: false,
        }
      : {
          kicker: "Clipping is now",
          value: "$1B+",
          note: "channel revenue",
          money: true,
        },
    stats.autoClipsThisWeek > 0
      ? {
          kicker: "Auto-clips this week",
          value: formatStat(stats.autoClipsThisWeek),
          note: "from live streams",
          money: false,
        }
      : {
          kicker: "Brands pay",
          value: "$1–6",
          note: "CPM per verified view",
          money: true,
        },
    stats.totalReadyClips > 0
      ? {
          kicker: "Clips generated",
          value: formatStat(stats.totalReadyClips),
          note: "ready to post",
          money: false,
        }
      : {
          kicker: "Top clippers earn",
          value: "5 figures",
          note: "per month, solo",
          money: true,
        },
    stats.hoursCaptured > 0
      ? {
          kicker: "Hours captured",
          value: formatStat(stats.hoursCaptured),
          note: "of live content",
          money: false,
        }
      : {
          kicker: "Twitch · YT · Kick",
          value: "16B+",
          note: "live hours per quarter",
          money: false,
        },
  ];

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((s, idx) => (
            <div
              key={s.kicker}
              className={
                idx === 0
                  ? "flex flex-col gap-1.5"
                  : "flex flex-col gap-1.5 lg:border-l lg:border-border lg:pl-8"
              }
            >
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {s.kicker}
              </span>
              <span
                className={`tnum text-4xl font-bold tracking-[-0.03em] md:text-5xl ${
                  s.money ? "text-mint" : "text-foreground"
                }`}
              >
                {s.value}
              </span>
              <span className="text-sm text-muted-foreground">{s.note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// How it works (3 steps)
// ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    title: "Connect your channel",
    body: "Twitch, YouTube, or Kick. We handle OAuth and tokens — you keep streaming.",
  },
  {
    num: "02",
    title: "AI clips your moments",
    body: "Live chat spikes and audio bursts auto-detect highlights. Vertical, captioned, ready to post.",
  },
  {
    num: "03",
    title: "Everyone in the chain gets paid",
    body: "Splits route automatically. Stripe Connect handles the rails. No invoices, no disputes.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            From stream to payout in 4 minutes.
          </h2>
          <span className="hidden font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground md:inline">
            03 steps
          </span>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.num} className="bg-background p-8">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
                {s.num}
              </span>
              <h3 className="mt-4 text-xl font-semibold tracking-[-0.01em]">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Why Clipt (3 differentiators)
// ─────────────────────────────────────────────────────────────

const PILLARS = [
  {
    icon: Radio,
    kicker: "Live AI clipping",
    title: "Catch the moment as it happens.",
    body: "Real-time chat-spike + audio-energy detection turns the live stream into ready-to-post shorts before the highlight cools off.",
  },
  {
    icon: Wallet,
    kicker: "Creator revenue share",
    title: "25% of every paid clip flows back.",
    body: "Subscriptions, brand campaigns, tips — every revenue source pays the original creator a verifiable share, every cycle.",
  },
  {
    icon: CircleDollarSign,
    kicker: "Verified attribution",
    title: "Tamper-proof signature on every clip.",
    body: "We sign every clip with a key only Clipt holds. Anyone — brands, platforms, fans — can verify the source streamer, even after re-uploads.",
  },
];

function WhyClipt() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Why Clipt.
          </h2>
          <span className="hidden font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground md:inline">
            03 pillars
          </span>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.kicker}>
              <p.icon
                className="h-6 w-6 text-accent"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="mt-6 block font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {p.kicker}
              </span>
              <h3 className="mt-2 text-xl font-semibold leading-tight tracking-[-0.01em]">
                {p.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Pricing — surfaces the same PLANS the billing page reads from
// ─────────────────────────────────────────────────────────────

function Pricing() {
  const tiers = [
    { plan: PLANS.free, highlight: false, cta: { label: "Start free", href: "/auth/signup" } },
    {
      plan: PLANS.creator,
      highlight: true,
      cta: { label: "Choose Creator", href: "/auth/signup?next=/dashboard/billing" },
    },
    {
      plan: PLANS.pro,
      highlight: false,
      cta: { label: "Choose Pro", href: "/auth/signup?next=/dashboard/billing" },
    },
  ];

  return (
    <section id="pricing" className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Pricing.
          </h2>
          <span className="hidden font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground md:inline">
            03 tiers · cancel anytime
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Start on Free. Upgrade the day your clip volume justifies it.
          No annual commit, no per-seat upcharge, no usage surprises.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {tiers.map(({ plan, highlight, cta }) => (
            <div
              key={plan.tier}
              className={`relative flex flex-col rounded-md border bg-card p-6 md:p-8 ${
                highlight
                  ? "border-accent shadow-glow"
                  : "border-border"
              }`}
            >
              {highlight ? (
                <span className="absolute -top-2.5 left-6 inline-flex rounded-full bg-accent px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-foreground">
                  Recommended
                </span>
              ) : null}
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {plan.name}
              </span>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-[-0.02em]">
                  {plan.price}
                </span>
                {plan.tier !== "free" ? (
                  <span className="text-xs text-muted-foreground">
                    billed monthly
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {plan.monthlyClipLimit === null
                  ? `Unlimited clips · ${plan.resolution} export`
                  : `${plan.monthlyClipLimit} clips/month · ${plan.resolution} export`}
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 flex-none text-accent"
                      strokeWidth={3}
                    />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Button
                  asChild
                  size="sm"
                  className={
                    highlight
                      ? "w-full bg-accent text-accent-foreground hover:bg-accent/90"
                      : "w-full"
                  }
                  variant={highlight ? "default" : "outline"}
                >
                  <Link href={cta.href}>{cta.label}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// FAQ — non-engineer language
// ─────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "Who actually owns the clip?",
    a: "The original streamer. Always. Every Clipt clip carries a tamper-proof signature linking it back to them — even after re-uploads. Anyone can verify it from our public signing key.",
  },
  {
    q: "How do payouts work?",
    a: "Daily. Connect a bank account once via Stripe, then earnings (subscriptions, brand campaigns, tips) flow in automatically. No invoices to chase. We handle 1099s.",
  },
  {
    q: "What platforms can I clip from?",
    a: "Today: Twitch (clips + VODs) and Kick. YouTube clips arrive next quarter. Post your finished clips to TikTok, Instagram Reels, and YouTube Shorts in one tap.",
  },
  {
    q: "Do I need to be a creator to use it?",
    a: "No. Fans get a one-tap clip button on every live stream. Brands fund campaigns through a separate console. Clippers earn without ever streaming themselves.",
  },
  {
    q: "Is the platform compliant?",
    a: "Yes. Every paid clip automatically gets the platform's branded-content tag and an FTC disclosure. Brands receive an audit-ready PDF for every campaign.",
  },
];

function Faq() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-28">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Questions.
          </h2>
          <span className="hidden font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground md:inline">
            FAQ
          </span>
        </div>
        <Accordion type="single" collapsible className="mt-8 border-t border-border">
          {FAQ.map((item, idx) => (
            <AccordionItem key={idx} value={`item-${idx}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom CTA — full waitlist form (the only one on the page now)
// ─────────────────────────────────────────────────────────────

function BottomCta() {
  return (
    <section id="waitlist" className="border-b border-border">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-20 md:grid-cols-[1fr_minmax(0,1fr)] md:py-28">
        <div>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] md:text-5xl">
            Stream. Clip.{" "}
            <span className="text-accent">Earn together.</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            We&rsquo;re onboarding in waves. Tell us who you are and we&rsquo;ll
            line up the right entry point.
          </p>
          <p className="mt-3 max-w-md text-xs text-muted-foreground/80">
            One email per wave. No spam. No share-to-skip-the-line stunts.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-6 shadow-brand-md backdrop-blur md:p-8">
          <WaitlistForm idPrefix="bottom" />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer — expanded with legal + status + contact
// ─────────────────────────────────────────────────────────────

function SiteFooter() {
  return (
    <footer>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo className="h-6" />
            <p className="mt-3 max-w-xs text-xs text-muted-foreground">
              The first clipping platform where every persona in the chain
              gets paid.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mint">
              <span className="inline-flex h-1.5 w-1.5 animate-pulse-dot rounded-full bg-mint" />
              All systems normal
            </div>
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Product
            </span>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="#product" className="text-foreground/80 hover:text-foreground">
                  Overview
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="text-foreground/80 hover:text-foreground">
                  How it works
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-foreground/80 hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <Link href="/auth/login" className="text-foreground/80 hover:text-foreground">
                  Log in
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Personas
            </span>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="#creators" className="text-foreground/80 hover:text-foreground">
                  For streamers
                </a>
              </li>
              <li>
                <a href="#fans" className="text-foreground/80 hover:text-foreground">
                  For fans
                </a>
              </li>
              <li>
                <a href="#clippers" className="text-foreground/80 hover:text-foreground">
                  For clippers
                </a>
              </li>
              <li>
                <a href="#brands" className="text-foreground/80 hover:text-foreground">
                  For brands
                </a>
              </li>
            </ul>
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Company
            </span>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a
                  href="mailto:hello@clipt.live"
                  className="text-foreground/80 hover:text-foreground"
                >
                  Contact
                </a>
              </li>
              <li>
                <Link href="/terms" className="text-foreground/80 hover:text-foreground">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-foreground/80 hover:text-foreground">
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/dev/conventions"
                  className="text-foreground/80 hover:text-foreground"
                >
                  Conventions
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 md:flex-row md:items-center">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            © 2026 Clipt
          </p>
          <p className="text-[11px] text-muted-foreground">
            Built with attribution at the core. Every clip carries its
            source.
          </p>
        </div>
      </div>
    </footer>
  );
}

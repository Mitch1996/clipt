import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CircleDollarSign,
  Clapperboard,
  Radio,
  Tv,
  Users,
  Wallet,
} from "lucide-react";

import { Logo } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { WaitlistForm } from "@/features/waitlist/components/WaitlistForm";

export const metadata = {
  title: "Clipt — Every clip pays the creator",
  description:
    "The first clipping platform where streamers, fans, clippers, and brands all win.",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <Hero />
        <PersonaGrid />
        <ClipEconomy />
        <HowItWorks />
        <WhyClipt />
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
          <ThemeToggle />
          <Button
            asChild
            size="sm"
            className="hidden bg-accent text-accent-foreground hover:bg-accent/90 sm:inline-flex"
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

function Hero() {
  return (
    <section id="product" className="border-b border-border">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-16 px-6 py-20 md:py-32 lg:grid-cols-[1.2fr_minmax(0,1fr)] lg:gap-20">
        <div>
          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
            Now in research preview
          </div>

          <h1 className="mt-8 max-w-3xl text-balance font-sans text-[clamp(2.5rem,7vw,5.75rem)] font-black leading-[0.95] tracking-[-0.04em]">
            Every clip pays
            <br />
            the{" "}
            <span className="relative whitespace-nowrap">
              creator
              <span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[0.18em] w-full bg-accent"
              />
            </span>
            .
          </h1>

          <p className="mt-8 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            The first clipping platform where streamers, fans, clippers, and
            brands all win.
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
            <Button size="lg" variant="ghost" className="gap-1.5">
              Watch the 60-second pitch
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          id="waitlist"
          className="rounded-lg border border-border bg-card/40 p-6 shadow-brand-md backdrop-blur md:p-8"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Waitlist · wave 01
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-[-0.02em]">
            Get in early.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Pick the lane that fits and we&rsquo;ll route you to the right
            onboarding when your wave opens.
          </p>
          <div className="mt-6">
            <WaitlistForm idPrefix="hero" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Persona grid (4-up, no purple)
// ─────────────────────────────────────────────────────────────

const PERSONAS = [
  {
    id: "creators",
    icon: Tv,
    title: "For streamers",
    body: "Connect once. Every clip from your stream — fan-made or AI-detected — credits and pays you automatically.",
  },
  {
    id: "fans",
    icon: Users,
    title: "For fans",
    body: "Tap to clip the last 30 seconds. Post it anywhere. Your favorite streamer gets the cut they earned.",
  },
  {
    id: "clippers",
    icon: Clapperboard,
    title: "For clippers",
    body: "Browse a marketplace of paid campaigns. KYC'd, branded, FTC-compliant by default. Get paid per verified view.",
  },
  {
    id: "brands",
    icon: BadgeCheck,
    title: "For brands",
    body: "Run clipping campaigns with cryptographic attribution and audit-grade compliance reports. CPM you can verify.",
  },
];

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
          {PERSONAS.map((p) => (
            <div
              key={p.id}
              id={p.id}
              className="bg-background p-6 transition-colors hover:bg-card md:p-8"
            >
              <p.icon
                className="h-6 w-6 text-accent"
                strokeWidth={1.75}
                aria-hidden
              />
              <h3 className="mt-6 text-lg font-semibold tracking-[-0.01em]">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
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
// Clip economy (4 stats, mint for money)
// ─────────────────────────────────────────────────────────────

const ECONOMY_STATS = [
  {
    kicker: "Clipping is now",
    value: "$1B+",
    note: "channel revenue",
    money: true,
  },
  {
    kicker: "Brands pay",
    value: "$1–6",
    note: "CPM per verified view",
    money: true,
  },
  {
    kicker: "Top clippers earn",
    value: "5 figures",
    note: "per month, solo",
    money: true,
  },
  {
    kicker: "Twitch · YT · Kick",
    value: "16B+",
    note: "live hours per quarter",
    money: false,
  },
];

function ClipEconomy() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {ECONOMY_STATS.map((s, idx) => (
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
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            How it works.
          </h2>
          <span className="hidden font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground md:inline">
            03 steps
          </span>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.num} className="bg-background p-8">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
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
    kicker: "Verified attribution + compliance",
    title: "Cryptographic proof, audit-ready reports.",
    body: "Every clip carries an ed25519 signature: source channel, original creator, timestamps, platform. Brands get audit-grade FTC-compliant compliance reports automatically.",
  },
];

function WhyClipt() {
  return (
    <section id="pricing" className="border-b border-border">
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
// FAQ
// ─────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "Who actually owns the clip?",
    a: "The original creator. Clipt embeds a cryptographic attribution signature in every clip we produce — source channel, creator, timestamps. The clipper gets credited too. Both are visible on the public clip page and verifiable with our public key.",
  },
  {
    q: "How do payouts work?",
    a: "Stripe Connect Express. Onboard once, then earnings (subscriptions and brand campaigns) flow into your account on a daily payout cron. We handle 1099s automatically through Connect.",
  },
  {
    q: "What platforms can I clip from?",
    a: "Phase 1 ships Twitch (clips and VODs) and Kick. YouTube clips arrive in Phase 2 once our Fly.io worker is deployed. Posting destinations: TikTok, Instagram Reels, YouTube Shorts.",
  },
  {
    q: "Do I need to be a creator to use it?",
    a: "No. Fans get a tap-to-clip button on every live stream. Brands fund campaigns through a separate console. Clippers can earn without ever streaming themselves.",
  },
  {
    q: "Is the platform compliant?",
    a: "Yes. Every paid clip auto-prepends FTC disclosure and triggers the platform's branded-content tag (TikTok, Reels, Shorts). Brands get an exportable PDF audit report per campaign.",
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
// Bottom CTA — same waitlist form, second placement
// ─────────────────────────────────────────────────────────────

function BottomCta() {
  return (
    <section className="border-b border-border">
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
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-6 shadow-brand-md backdrop-blur md:p-8">
          <WaitlistForm idPrefix="bottom" />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────

function SiteFooter() {
  return (
    <footer>
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-12 md:flex-row md:items-center">
        <Logo className="h-6" />
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <a href="#product" className="hover:text-foreground">
            Product
          </a>
          <a href="#creators" className="hover:text-foreground">
            Creators
          </a>
          <a href="#brands" className="hover:text-foreground">
            Brands
          </a>
          <a href="/dev/conventions" className="hover:text-foreground">
            Conventions
          </a>
        </nav>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          © 2026 Clipt
        </p>
      </div>
    </footer>
  );
}

import { ArrowRight, ArrowUpRight, Check } from "lucide-react";

import { Logo } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Logo pulse className="h-7" />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#product" className="transition-colors hover:text-foreground">
              Product
            </a>
            <a href="#creators" className="transition-colors hover:text-foreground">
              Creators
            </a>
            <a href="#clippers" className="transition-colors hover:text-foreground">
              Clippers
            </a>
            <a href="#brands" className="transition-colors hover:text-foreground">
              Brands
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button size="sm" className="hidden sm:inline-flex">
              Join waitlist
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span className="inline-flex h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
              Now in research preview
            </div>

            <h1 className="mt-8 max-w-5xl text-balance font-sans text-[clamp(2.5rem,7vw,5.75rem)] font-black leading-[0.95] tracking-[-0.04em]">
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
              Stream. Clip. Earn together. The first clipping platform where streamers,
              fans, clippers, and brands all share the cut — automatically, on every
              play.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="bg-accent text-accent-foreground shadow-glow hover:bg-accent/90"
              >
                Join the waitlist
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button size="lg" variant="ghost" className="gap-1.5">
                Watch the 60-second pitch
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {/* Stat strip — hairline-divided 3-up, mono numbers, mint for money */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl grid-cols-1 md:grid-cols-3">
            <Stat
              kicker="Paid to creators"
              value="$48.2M"
              note="across 11.4M verified clips"
              tone="mint"
            />
            <Stat
              kicker="Avg. payout time"
              value="4h 12m"
              note="from clip → cleared funds"
              hairline
            />
            <Stat
              kicker="Live channels"
              value="2,418"
              note="streaming right now"
              hairline
            />
          </div>
        </section>

        {/* Verified attribution — the differentiator */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-16 px-6 py-24 md:grid-cols-[1fr_minmax(0,1fr)]">
            <div>
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                The differentiator
              </span>
              <h2 className="mt-4 text-4xl font-bold leading-[1.05] tracking-[-0.03em] md:text-5xl">
                Every clip carries{" "}
                <span className="text-accent">cryptographic proof</span> of who
                made it.
              </h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
                Source channel, original creator, timestamps, issuing platform — signed
                with our key, verifiable by anyone. No more attribution disputes. No
                more uncredited clips.
              </p>
              <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs uppercase tracking-wider">
                  ed25519
                </span>
                <span>·</span>
                <span className="font-mono text-xs uppercase tracking-wider">
                  jwt
                </span>
                <span>·</span>
                <span className="font-mono text-xs uppercase tracking-wider">
                  embedded in mp4
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start justify-center gap-10">
              <AttributionBadge />
              <AttributionBadge live />
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                pulse-attribution · 2s · ease-in-out · ∞
              </p>
            </div>
          </div>
        </section>

        {/* How it works — terse 3-step ribbon */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <div className="flex items-baseline justify-between">
              <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
                How it works
              </h2>
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                03 steps
              </span>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
              <Step
                num="01"
                title="Connect your channel"
                body="Twitch, YouTube, Kick. We handle OAuth and tokens."
              />
              <Step
                num="02"
                title="AI clips your moments"
                body="Live chat spikes + audio bursts → vertical, captioned shorts."
              />
              <Step
                num="03"
                title="Everyone gets paid"
                body="Splits route automatically. Stripe Connect handles the rails."
              />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer>
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-12 md:flex-row md:items-center">
            <Logo className="h-6" />
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              © 2026 Clipt · Stream. Clip. Earn together.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Stat({
  kicker,
  value,
  note,
  tone,
  hairline,
}: {
  kicker: string;
  value: string;
  note: string;
  tone?: "mint";
  hairline?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-2 px-6 py-10",
        hairline
          ? "md:border-l md:border-border"
          : "",
      ].join(" ")}
    >
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {kicker}
      </span>
      <span
        className={[
          "tnum font-sans text-4xl font-bold tracking-[-0.03em] md:text-5xl",
          tone === "mint" ? "text-mint" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </div>
  );
}

function Step({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-background p-8">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {num}
      </span>
      <h3 className="mt-4 text-xl font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function AttributionBadge({ live = false }: { live?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={[
          "inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 py-1.5 pl-1.5 pr-3.5 text-sm font-semibold text-foreground",
          live ? "animate-pulse-attribution" : "",
        ].join(" ")}
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        Verified attribution
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {live ? "live · settling" : "at rest"}
      </span>
    </div>
  );
}

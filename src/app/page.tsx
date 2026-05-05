import { Check } from "lucide-react";

import { Logo } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      {/* Mesh gradient — purple, navy, mint stacked radials. Fades into the
          surface so dark and light modes both stay legible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-90 dark:opacity-100"
        style={{
          background: `
            radial-gradient(60% 50% at 80% 0%, hsl(var(--accent) / 0.30), transparent 60%),
            radial-gradient(50% 40% at 0% 30%, hsl(var(--primary) / 0.35), transparent 60%),
            radial-gradient(40% 30% at 50% 100%, hsl(var(--mint) / 0.18), transparent 60%)
          `,
        }}
      />
      {/* Faint grid masked by a radial vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05] dark:opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 60% 50% at 50% 30%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 60% 50% at 50% 30%, black 30%, transparent 80%)",
        }}
      />

      <header className="container flex items-center justify-between py-6">
        <Logo pulse className="h-8" />
        <ThemeToggle />
      </header>

      <main className="container flex flex-col items-center pt-20 pb-32 text-center">
        <Badge
          variant="outline"
          className="mb-6 border-accent/40 bg-accent/10 text-accent"
        >
          Research preview
        </Badge>

        <h1 className="display max-w-3xl text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          Every clip pays
          <br />
          the <span className="text-accent">creator</span>.
        </h1>

        <p className="mt-6 max-w-xl text-pretty text-base text-muted-foreground md:text-lg">
          The first clipping platform where streamers, fans, clippers, and brands
          all win. Stream. Clip. Earn together.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            className="bg-accent text-accent-foreground shadow-glow hover:bg-accent/90"
          >
            Join the waitlist
          </Button>
          <Button size="lg" variant="ghost">
            Watch the 60-second pitch
          </Button>
        </div>

        {/* Verified-attribution badge — the highest-leverage piece of UI in the
            whole system. Shown live (pulse) so you can see the keyframe. */}
        <div className="mt-16 flex flex-col items-center gap-2">
          <span className="inline-flex animate-pulse-attribution items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-3.5 py-1.5 text-sm font-semibold text-foreground backdrop-blur-md">
            <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            Verified attribution
          </span>
          <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            pulse-attribution · 2s ∞
          </span>
        </div>

        {/* Stat strip — frosted card, mint-tinted border, money-as-mint */}
        <div className="container mt-20 max-w-3xl">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-mint/30 bg-card/40 backdrop-blur-md md:grid-cols-3">
            <Stat label="Paid to creators" value="$48.2M" tone="mint" />
            <Stat label="Clips processed" value="11.4M" />
            <Stat label="Avg. payout time" value="4h 12m" />
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "mint";
}) {
  return (
    <div className="flex flex-col items-start gap-1 bg-card/60 p-6 text-left tabular-nums">
      <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span
        className={
          tone === "mint"
            ? "text-2xl font-bold text-mint"
            : "text-2xl font-bold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

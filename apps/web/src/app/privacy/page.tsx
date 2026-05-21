import Link from "next/link";

import { Logo } from "@/components/shared/Logo";

export const metadata = {
  title: "Privacy — Clipt",
  description: "How Clipt handles your data.",
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "2026-05-21";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <Link href="/">
            <Logo className="h-6" />
          </Link>
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            ← Home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Last updated · {LAST_UPDATED}
        </span>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em]">Privacy</h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Plain-language summary while the full policy is being drafted.
        </p>
        <h2 className="mt-10 text-lg font-semibold">What we collect</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>· Your email + the persona you picked (streamer / fan / clipper / brand).</li>
          <li>· OAuth tokens for any channel you connect (encrypted at rest).</li>
          <li>· Clip metadata: who clipped what, when, for which campaign.</li>
          <li>· Stripe payout details (handled by Stripe, never stored on our servers).</li>
        </ul>
        <h2 className="mt-10 text-lg font-semibold">What we do not collect</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>· No third-party analytics or session-replay tools.</li>
          <li>· No selling or sharing your email with anyone.</li>
          <li>· No tracking pixels beyond a single first-party hit counter.</li>
        </ul>
        <h2 className="mt-10 text-lg font-semibold">Your data, your move</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Email{" "}
          <a
            href="mailto:hello@clipt.live"
            className="text-foreground underline hover:text-accent"
          >
            hello@clipt.live
          </a>{" "}
          to export or delete your account at any time. We act within 14
          days.
        </p>
      </main>
    </div>
  );
}

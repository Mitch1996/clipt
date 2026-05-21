import Link from "next/link";

import { Logo } from "@/components/shared/Logo";

export const metadata = {
  title: "Terms — Clipt",
  description: "Clipt terms of service (draft).",
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "2026-05-21";

export default function TermsPage() {
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
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em]">Terms of service</h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Clipt is in research preview. Full terms are being drafted with
          counsel before public launch. By using the service today you
          agree that:
        </p>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">Attribution stays attached.</strong>{" "}
            Every clip Clipt produces carries a cryptographic signature
            linking it to the original streamer. You will not strip or
            tamper with that signature.
          </li>
          <li>
            <strong className="text-foreground">Source rights are not transferred.</strong>{" "}
            Clipping a stream does not give you ownership of the source
            content. The streamer retains all rights to the underlying
            footage.
          </li>
          <li>
            <strong className="text-foreground">No automated abuse.</strong>{" "}
            Bulk clipping, view-pumping, fake engagement, or
            misrepresenting attribution will result in account
            termination and forfeit of any pending payouts.
          </li>
          <li>
            <strong className="text-foreground">Payouts are best-effort during preview.</strong>{" "}
            Stripe Connect handles money flow. We reserve the right to
            hold payouts during the research preview if an account looks
            fraudulent.
          </li>
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">
          Questions about how this applies to you? Reach{" "}
          <a
            href="mailto:hello@clipt.live"
            className="text-foreground underline hover:text-accent"
          >
            hello@clipt.live
          </a>
          .
        </p>
      </main>
    </div>
  );
}

import Link from "next/link";

import { Separator } from "@/components/ui/separator";
import { PasteUrlForm } from "@/features/clips/components/PasteUrlForm";

export const metadata = {
  title: "New clip — Clipt",
};

export default function NewClipPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Dashboard / clips / new
        </span>
        <Link
          href="/dashboard"
          className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          ← back
        </Link>
      </div>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
        New clip.
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Paste a URL — we&rsquo;ll download the source, transcribe, reframe to
        vertical, and sign attribution. The clip page updates live.
      </p>

      <Separator className="my-10" />

      <PasteUrlForm />

      <div className="mt-10 rounded-md border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
        <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-foreground">
          Supported sources
        </h3>
        <ul className="mt-3 space-y-1 font-mono text-xs">
          <li>twitch.tv/&lt;channel&gt;/clip/&lt;slug&gt;</li>
          <li>twitch.tv/videos/&lt;id&gt;</li>
          <li>youtube.com/watch?v=… · youtu.be/…</li>
          <li>youtube.com/shorts/…</li>
          <li>kick.com/&lt;channel&gt;/clips/&lt;slug&gt;</li>
        </ul>
        <p className="mt-3">
          Note: in Phase 1 only Twitch <em>clips</em> and Kick <em>clips</em> are
          fully downloaded. Twitch VODs and YouTube sources land in Phase 2 once
          the Fly.io worker is deployed.
        </p>
      </div>
    </div>
  );
}

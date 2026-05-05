import { TriggerButton } from "./TriggerButton";

export const metadata = {
  title: "Inngest dev — Clipt",
};

export const dynamic = "force-dynamic";

export default function InngestDevPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        /dev/inngest
      </span>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em]">
        Background jobs.
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Inserts a dummy clip row, fires <span className="font-mono">clip/requested</span>,
        and the <span className="font-mono">processClip</span> function flips
        its status from <code>pending</code> →{" "}
        <code>processing</code> → <code>ready</code> after a 5-second sleep.
      </p>

      <div className="mt-10 rounded-md border border-border bg-card p-6">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          Trigger a test run
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Watch the run live in the Inngest dev UI at{" "}
          <a
            href="http://127.0.0.1:8288"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-4"
          >
            127.0.0.1:8288
          </a>{" "}
          (started via <span className="font-mono">pnpm inngest:dev</span>).
        </p>
        <div className="mt-6">
          <TriggerButton />
        </div>
      </div>

      <div className="mt-10 rounded-md border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
        <h3 className="font-mono text-xs uppercase tracking-[0.14em]">Local setup</h3>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>
            Run <span className="font-mono">pnpm dev</span> in one terminal.
          </li>
          <li>
            Run <span className="font-mono">pnpm inngest:dev</span> in another;
            it&rsquo;ll connect to <span className="font-mono">/api/inngest</span> and
            open the dashboard at{" "}
            <span className="font-mono">127.0.0.1:8288</span>.
          </li>
          <li>Click the button above. Open the dashboard to see the run.</li>
        </ol>
      </div>
    </main>
  );
}

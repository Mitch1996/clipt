import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TABLES = [
  "profiles",
  "channels",
  "clips",
  "clip_posts",
  "attributions",
  "earnings_ledger",
  "waitlist",
] as const;

async function probeTable(table: (typeof TABLES)[number]) {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  return { table, ok: !error, message: error?.message ?? "", count: count ?? 0 };
}

export default async function HealthPage() {
  const results = await Promise.all(TABLES.map(probeTable));
  const allOk = results.every((r) => r.ok);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-[-0.02em]">/dev/health</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Anonymous SSR Supabase client probing every public table. Errors here
        usually mean either the env vars are missing/wrong, or RLS denies
        anonymous reads (which is correct for some tables — see the table
        below).
      </p>

      <div
        className={[
          "mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium",
          allOk
            ? "border-mint/40 bg-mint/10 text-mint"
            : "border-destructive/40 bg-destructive/10 text-destructive",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-2 w-2 rounded-full",
            allOk ? "bg-mint" : "bg-destructive",
          ].join(" ")}
        />
        {allOk ? "all reachable" : "one or more probes failed"}
      </div>

      <div className="mt-8 overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">table</th>
              <th className="px-4 py-3 font-medium">ok</th>
              <th className="px-4 py-3 font-medium">rows</th>
              <th className="px-4 py-3 font-medium">message</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {results.map((r) => (
              <tr key={r.table} className="border-t border-border">
                <td className="px-4 py-3">{r.table}</td>
                <td className="px-4 py-3">{r.ok ? "✓" : "✗"}</td>
                <td className="px-4 py-3 tabular-nums">{r.count}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.message || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

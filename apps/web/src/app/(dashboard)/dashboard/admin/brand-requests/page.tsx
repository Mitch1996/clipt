import { notFound, redirect } from "next/navigation";

import { BrandRequestReviewButtons } from "@/features/brands/components/BrandRequestReviewButtons";
import { listBrandAccessRequests } from "@/features/brands/server/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin · Brand requests — Clipt" };
export const dynamic = "force-dynamic";

export default async function AdminBrandRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/brand-requests");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") notFound();

  const requests = await listBrandAccessRequests();
  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Admin / brand requests
      </span>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
        Brand access queue
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Approve a request → the requester&rsquo;s profile role flips to
        &lsquo;brand&rsquo; immediately and they can create campaigns at
        /brands. Reject → they see the note + can resubmit.
      </p>

      <h2 className="mt-12 text-lg font-semibold tracking-[-0.01em]">
        Pending ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
          Nothing waiting.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {pending.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-accent/30 bg-accent/[0.04] p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold tracking-[-0.005em]">
                  {r.company_name}
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  @{r.profile?.handle ?? "unknown"} ·{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.company_url ? (
                <a
                  href={r.company_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block break-all font-mono text-[11px] text-accent hover:underline"
                >
                  {r.company_url}
                </a>
              ) : null}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {r.intended_use}
              </p>
              <div className="mt-4">
                <BrandRequestReviewButtons requestId={r.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-12 text-lg font-semibold tracking-[-0.01em]">
        Reviewed ({reviewed.length})
      </h2>
      {reviewed.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
          No history yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {reviewed.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border bg-card p-4"
            >
              <div>
                <span className="text-sm font-medium">{r.company_name}</span>{" "}
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  @{r.profile?.handle ?? "unknown"}
                </span>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                  r.status === "approved"
                    ? "border-mint/40 bg-mint/10 text-mint"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

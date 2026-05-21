import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin · Triage — Clipt" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

type FailedClip = {
  id: string;
  title: string | null;
  created_at: string;
  source_channel_id: string | null;
  source_kind: string | null;
  face_cam_corner: string | null;
  face_cam_corner_source: string | null;
  verification_attempts: number;
  processing_error: string | null;
  channels: {
    platform: string;
    platform_username: string | null;
    is_vtuber: boolean | null;
    face_cam_corner: string | null;
    face_cam_corner_confidence: number | null;
  } | null;
};

export default async function TriagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/triage");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") notFound();

  const { data: clips } = await admin
    .from("clips")
    .select(
      "id, title, created_at, source_channel_id, source_kind, face_cam_corner, face_cam_corner_source, verification_attempts, processing_error, channels:channels!clips_source_channel_id_fkey(platform, platform_username, is_vtuber, face_cam_corner, face_cam_corner_confidence)",
    )
    .eq("verification_status", "failed")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (clips ?? []) as unknown as FailedClip[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Admin / triage
      </span>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
        Verification failures
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Clips that exhausted the self-heal circuit breaker (≥2 re-render
        attempts) and still failed post-render verification. Usually
        means the channel has a pathologically ambiguous layout the
        consensus detector can&rsquo;t disambiguate. Manual fix path: rebuild
        the channel&rsquo;s VTuber classification, or accept the bad render and
        flag the channel for special handling.
      </p>

      <h2 className="mt-12 text-lg font-semibold tracking-[-0.01em]">
        Failed clips ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-card/40 px-4 py-8 text-sm text-muted-foreground">
          Nothing in the triage queue. The self-heal loop is handling
          everything.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-destructive/30 bg-destructive/[0.04] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <Link
                      href={`/c/${c.id}`}
                      target="_blank"
                      className="font-medium tracking-[-0.005em] hover:text-accent"
                    >
                      {c.title ?? "Untitled clip"}
                    </Link>
                  </div>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    @{c.channels?.platform_username ?? "unknown"}{" "}
                    {c.channels?.is_vtuber ? "· vtuber" : "· human"} ·{" "}
                    {new Date(c.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    · {c.source_kind ?? "unknown source"}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <Stat
                      label="Clip corner"
                      value={c.face_cam_corner ?? "—"}
                    />
                    <Stat
                      label="Detection source"
                      value={c.face_cam_corner_source ?? "—"}
                    />
                    <Stat
                      label="Channel corner"
                      value={
                        c.channels?.face_cam_corner ?? "—"
                      }
                    />
                    <Stat
                      label="Confidence"
                      value={
                        c.channels?.face_cam_corner_confidence
                          ? `${Math.round(c.channels.face_cam_corner_confidence * 100)}%`
                          : "—"
                      }
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-mono uppercase tracking-[0.14em]">
                      Attempts:
                    </span>{" "}
                    {c.verification_attempts}{" "}
                    {c.processing_error ? (
                      <>
                        {" · "}
                        <span className="text-foreground/80">
                          {c.processing_error}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <Link
                  href={`/c/${c.id}`}
                  target="_blank"
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground hover:text-accent"
                >
                  View clip →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-foreground/80">
        {value ?? "—"}
      </p>
    </div>
  );
}

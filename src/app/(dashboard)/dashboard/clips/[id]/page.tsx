import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ClipStatusLive } from "@/features/clips/components/ClipStatusLive";
import type { ClipStatus } from "@/features/clips/schema";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `Clip ${id.slice(0, 8)} — Clipt` };
}

export default async function ClipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: clip, error } = await supabase
    .from("clips")
    .select(
      "id, status, processing_error, source_url, source_platform, source_kind, title, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !clip) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Dashboard / clips / {clip.id.slice(0, 8)}
        </span>
        <Link
          href="/dashboard/clips/new"
          className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          + new clip
        </Link>
      </div>

      <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] md:text-4xl">
        {clip.title ?? "Untitled clip"}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {clip.source_platform && (
          <Badge variant="outline">{clip.source_platform}</Badge>
        )}
        {clip.source_kind && <Badge variant="outline">{clip.source_kind}</Badge>}
        <Badge
          variant="outline"
          className="border-border font-mono text-[11px] text-muted-foreground"
        >
          {new Date(clip.created_at).toLocaleString()}
        </Badge>
      </div>

      {clip.source_url && (
        <p className="mt-4 break-all font-mono text-xs text-muted-foreground">
          source: {clip.source_url}
        </p>
      )}

      <Separator className="my-8" />

      <ClipStatusLive
        clipId={clip.id}
        initialStatus={clip.status as ClipStatus}
        initialError={clip.processing_error}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, Download, Film, Music2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CaptionEditor } from "@/features/clips/components/CaptionEditor";
import { ClipMetaForm } from "@/features/clips/components/ClipMetaForm";
import { ClipPlayer } from "@/features/clips/components/ClipPlayer";
import { ClipStatusLive } from "@/features/clips/components/ClipStatusLive";
import { DeleteClipDialog } from "@/features/clips/components/DeleteClipDialog";
import { PublicLinkCopy } from "@/features/clips/components/PublicLinkCopy";
import {
  captionsJsonSchema,
  type CaptionsJson,
  type ClipStatus,
  type ClipVisibility,
} from "@/features/clips/schema";
import { StorageKeys, getSignedDownloadUrl } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3006";

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

  const { data: clip } = await supabase
    .from("clips")
    .select(
      "id, status, processing_error, source_url, source_platform, source_kind, title, visibility, captions_json, vertical_video_r2_key, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!clip) notFound();

  const isReady = clip.status === "ready" && clip.vertical_video_r2_key;
  const captions = parseCaptions(clip.captions_json);
  const videoUrl = isReady
    ? await getSignedDownloadUrl(clip.vertical_video_r2_key!, 3600)
    : null;
  const thumbnailUrl = isReady
    ? await tryGetSignedUrl(StorageKeys.thumbnail(clip.id))
    : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
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

      {!isReady && (
        <ClipStatusLive
          clipId={clip.id}
          initialStatus={clip.status as ClipStatus}
          initialError={clip.processing_error}
        />
      )}

      {isReady && videoUrl && (
        <ReadyEditor
          clipId={clip.id}
          title={clip.title ?? "Untitled clip"}
          visibility={(clip.visibility as ClipVisibility) ?? "public"}
          videoUrl={videoUrl}
          thumbnailUrl={thumbnailUrl}
          captions={captions}
        />
      )}
    </div>
  );
}

function ReadyEditor({
  clipId,
  title,
  visibility,
  videoUrl,
  thumbnailUrl,
  captions,
}: {
  clipId: string;
  title: string;
  visibility: ClipVisibility;
  videoUrl: string;
  thumbnailUrl: string | null;
  captions: CaptionsJson;
}) {
  const publicUrl = `${APP_URL}/c/${clipId}`;

  return (
    <div className="grid gap-10 md:grid-cols-[300px,1fr]">
      <div className="space-y-4">
        <ClipPlayer src={videoUrl} poster={thumbnailUrl} />

        <Button asChild variant="outline" size="sm" className="w-full">
          <a href={videoUrl} download={`clipt-${clipId.slice(0, 8)}.mp4`}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download mp4
          </a>
        </Button>

        <PublicLinkCopy
          url={publicUrl}
          unlisted={visibility === "unlisted"}
        />

        <PostButtons />
      </div>

      <div className="min-w-0 space-y-10">
        <Section title="Details">
          <ClipMetaForm
            clipId={clipId}
            initialTitle={title}
            initialVisibility={visibility}
          />
        </Section>

        <Section title="Captions">
          <CaptionEditor clipId={clipId} initialCaptions={captions} />
        </Section>

        <Section title="Analytics">
          <AnalyticsCards />
        </Section>

        <Section title="Danger zone">
          <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 p-4">
            <div>
              <p className="text-sm font-medium">Delete this clip</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Soft-delete: hides the clip from your dashboard and the
                public page.
              </p>
            </div>
            <DeleteClipDialog clipId={clipId} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PostButtons() {
  // Real posting wires up in Prompt 1.14 (TikTok / IG / YT Shorts OAuth +
  // upload). For now these are placeholders that surface the connect
  // requirement so the editor surface still feels complete.
  const items = [
    { label: "TikTok", icon: Music2 },
    { label: "Instagram Reels", icon: Camera },
    { label: "YouTube Shorts", icon: Film },
  ] as const;
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Post to
      </p>
      {items.map(({ label, icon: Icon }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="w-full justify-start"
        >
          <Icon className="mr-1.5 h-3.5 w-3.5" />
          Connect {label} to enable
        </Button>
      ))}
    </div>
  );
}

function AnalyticsCards() {
  const cards = [
    { label: "Views", value: "0", note: "Wired up in Prompt 1.14." },
    { label: "Earnings", value: "$0.00", note: "Stripe Connect lands in Phase 3." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-md border border-border bg-card p-4"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {c.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">
            {c.value}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{c.note}</p>
        </div>
      ))}
    </div>
  );
}

function parseCaptions(raw: unknown): CaptionsJson {
  const parsed = captionsJsonSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { language: "en", segments: [] };
}

async function tryGetSignedUrl(key: string): Promise<string | null> {
  try {
    return await getSignedDownloadUrl(key, 3600);
  } catch {
    return null;
  }
}

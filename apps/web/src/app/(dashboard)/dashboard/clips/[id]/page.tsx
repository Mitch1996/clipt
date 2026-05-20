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
import {
  ClipPostsList,
  type ClipPostRow,
} from "@/features/publishing/components/ClipPostsList";
import { PostDialog } from "@/features/publishing/components/PostDialog";
import type { PublishPlatform } from "@/features/publishing/schema";
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
      "id, status, processing_step, processing_error, source_url, source_platform, source_kind, title, visibility, captions_json, vertical_video_r2_key, created_at",
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

  // Connected publish channels + existing posts.
  const { data: connectedChannelRows } = await supabase
    .from("channels")
    .select("platform")
    .not("access_token_encrypted", "is", null);

  const connectedPlatforms = new Set(
    (connectedChannelRows ?? []).map((r) => r.platform),
  );
  // YouTube Shorts piggy-backs on a connected youtube channel.
  const canPostTo: Record<PublishPlatform, boolean> = {
    youtube_shorts: connectedPlatforms.has("youtube"),
    tiktok: connectedPlatforms.has("tiktok"),
    instagram: connectedPlatforms.has("instagram"),
  };

  const { data: postRows } = await supabase
    .from("clip_posts")
    .select(
      "id, platform, platform_post_id, view_count, like_count, posted_at, scheduled_for, last_synced_at",
    )
    .eq("clip_id", clip.id)
    .order("created_at", { ascending: false });

  const posts = (postRows ?? []) as ClipPostRow[];
  const totalViews = posts.reduce((acc, p) => acc + (p.view_count || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
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
          initialStep={clip.processing_step}
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
          canPostTo={canPostTo}
          posts={posts}
          totalViews={totalViews}
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
  canPostTo,
  posts,
  totalViews,
}: {
  clipId: string;
  title: string;
  visibility: ClipVisibility;
  videoUrl: string;
  thumbnailUrl: string | null;
  captions: CaptionsJson;
  canPostTo: Record<PublishPlatform, boolean>;
  posts: ClipPostRow[];
  totalViews: number;
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

        <PostButtons clipId={clipId} title={title} canPostTo={canPostTo} />
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

        <Section title="Posts">
          <ClipPostsList posts={posts} />
        </Section>

        <Section title="Analytics">
          <AnalyticsCards totalViews={totalViews} />
        </Section>

        <Section title="Danger zone">
          <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
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

function PostButtons({
  clipId,
  title,
  canPostTo,
}: {
  clipId: string;
  title: string;
  canPostTo: Record<PublishPlatform, boolean>;
}) {
  const items = [
    { platform: "youtube_shorts", label: "YouTube Shorts", icon: Film },
    { platform: "tiktok", label: "TikTok", icon: Music2 },
    { platform: "instagram", label: "Instagram Reels", icon: Camera },
  ] as const satisfies ReadonlyArray<{
    platform: PublishPlatform;
    label: string;
    icon: typeof Film;
  }>;

  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Post to
      </p>
      {items.map(({ platform, label, icon: Icon }) => {
        const enabled = canPostTo[platform];
        return (
          <PostDialog
            key={platform}
            clipId={clipId}
            platform={platform}
            disabled={!enabled}
            initialCaption={title}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!enabled}
              className="w-full justify-start"
            >
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              {enabled ? `Post to ${label}` : `Connect ${label.split(" ")[0]} to enable`}
            </Button>
          </PostDialog>
        );
      })}
    </div>
  );
}

function AnalyticsCards({ totalViews }: { totalViews: number }) {
  const cards = [
    {
      label: "Views",
      value: totalViews.toLocaleString(),
      note:
        totalViews > 0
          ? "Sum across all platforms; refreshed every 30 min via syncPostStats."
          : "No posts yet.",
    },
    {
      label: "Earnings",
      value: "$0.00",
      note: "Stripe Connect lands in Phase 3.",
    },
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

"use client";

import * as React from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { cancelScheduledPost, syncPostStatsNow } from "../server/actions";
import type { PublishPlatform } from "../schema";

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube_shorts: "YouTube Shorts",
};

function postUrl(platform: string, postId: string): string | null {
  switch (platform) {
    case "youtube_shorts":
      return `https://youtube.com/shorts/${postId}`;
    case "tiktok":
      // TikTok needs the username; we don't have it on the clip_posts row,
      // so fall back to opening the post id (TikTok will redirect).
      return `https://www.tiktok.com/video/${postId}`;
    case "instagram":
      return `https://www.instagram.com/reel/${postId}/`;
    default:
      return null;
  }
}

export interface ClipPostRow {
  id: string;
  platform: string;
  platform_post_id: string | null;
  view_count: number;
  like_count: number;
  posted_at: string | null;
  scheduled_for: string | null;
  last_synced_at: string | null;
}

export interface ClipPostsListProps {
  posts: ClipPostRow[];
}

export function ClipPostsList({ posts }: ClipPostsListProps) {
  if (posts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No posts yet. Use the buttons above to publish to a connected platform.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {posts.map((p) => (
        <PostRow key={p.id} post={p} />
      ))}
    </div>
  );
}

function PostRow({ post }: { post: ClipPostRow }) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState<"sync" | "cancel" | null>(null);

  const platformLabel = PLATFORM_LABEL[post.platform] ?? post.platform;
  const isScheduledOnly = !post.platform_post_id && !!post.scheduled_for;
  const isPosted = !!post.platform_post_id;
  const url = post.platform_post_id ? postUrl(post.platform, post.platform_post_id) : null;

  const onSync = async () => {
    setPending("sync");
    const result = await syncPostStatsNow(post.id);
    setPending(null);
    if (!result.ok) {
      toast({
        title: "Sync failed",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: `Synced ${platformLabel}` });
  };

  const onCancel = async () => {
    setPending("cancel");
    const result = await cancelScheduledPost(post.id);
    setPending(null);
    if (!result.ok) {
      toast({
        title: "Couldn't cancel",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Scheduled post cancelled" });
  };

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Badge variant="outline" className="shrink-0">
          {platformLabel}
        </Badge>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            {isPosted ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-mint" />
            ) : (
              <CalendarClock className="h-3.5 w-3.5 text-accent" />
            )}
            <span className="truncate">
              {isPosted
                ? `${post.view_count.toLocaleString()} views · ${post.like_count.toLocaleString()} likes`
                : `Scheduled ${new Date(post.scheduled_for!).toLocaleString()}`}
            </span>
          </div>
          {isPosted && post.last_synced_at && (
            <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              synced {new Date(post.last_synced_at).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {url && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        {isPosted && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending !== null}
            onClick={onSync}
            className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${pending === "sync" ? "animate-spin" : ""}`}
            />
            Sync
          </Button>
        )}
        {isScheduledOnly && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending !== null}
            onClick={onCancel}
            className="h-8 gap-1 px-2 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// Keep the type referenced so removing PostDialog from a future page
// doesn't tree-shake out the platform union.
void (null as unknown as PublishPlatform);

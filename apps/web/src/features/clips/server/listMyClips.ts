import "server-only";

import { createClient } from "@/lib/supabase/server";
import { StorageKeys, getSignedDownloadUrl } from "@/lib/storage/r2";

import type { ClipStatus } from "../schema";

export interface MyClipRow {
  id: string;
  title: string | null;
  status: ClipStatus;
  processing_step: string | null;
  source_platform: string | null;
  source_url: string | null;
  duration_seconds: number | null;
  created_at: string;
  thumbnailUrl: string | null;
}

/**
 * Pull the signed-in user's most recent clips for the dashboard grid.
 *
 * Filters out soft-deleted rows (RLS already excludes them but we
 * mirror the predicate so the SQL doesn't accidentally widen if the
 * policy is loosened). Thumbnails are signed in parallel — a 1h TTL
 * matches what /c/[id] does so caches share the URL where possible.
 *
 * Default page size is 24 — enough for "last few days of clipping",
 * small enough that signing 24 S3 URLs in parallel stays well under a
 * second on Vercel.
 */
export async function listMyClips(limit = 24): Promise<MyClipRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("clips")
    .select(
      "id, title, status, processing_step, source_platform, source_url, duration_seconds, created_at, vertical_video_r2_key",
    )
    .eq("clipper_profile_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listMyClips:", error);
    return [];
  }
  if (!data || data.length === 0) return [];

  // Sign thumbnail URLs in parallel. Best-effort: a missing thumbnail
  // (clip still processing, render failed) just returns null and the
  // grid falls back to a placeholder.
  const withThumbs = await Promise.all(
    data.map(async (row) => {
      let thumbnailUrl: string | null = null;
      if (row.status === "ready") {
        try {
          thumbnailUrl = await getSignedDownloadUrl(
            StorageKeys.thumbnail(row.id),
            3600,
          );
        } catch {
          // ignore — fall back to placeholder
        }
      }
      return {
        id: row.id,
        title: row.title,
        status: row.status as ClipStatus,
        processing_step: row.processing_step,
        source_platform: row.source_platform,
        source_url: row.source_url,
        duration_seconds: row.duration_seconds,
        created_at: row.created_at,
        thumbnailUrl,
      };
    }),
  );

  return withThumbs;
}

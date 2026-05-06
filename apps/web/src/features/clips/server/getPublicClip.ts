import "server-only";

import { cache } from "react";
import { decodeJwt } from "jose";

import type { AttributionPayload } from "@/lib/attribution/sign";
import { StorageKeys, getSignedDownloadUrl } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side loader for the public clip page (`/c/[clipId]`).
 *
 * Fetches the clip + its source-creator profile + clipper profile,
 * mints signed URLs for the vertical mp4 + thumbnail, and parses the
 * attribution JWT for the verified badge dialog.
 *
 * Uses the admin client (cookies-free) so the page can render under
 * `revalidate=60` ISR. We still gate on `status='ready'` ourselves —
 * the public-read RLS policy does the same, but admin bypasses RLS.
 */

export interface PublicClipData {
  id: string;
  title: string;
  durationSeconds: number | null;
  createdAt: string;
  viewCount: number;

  videoUrl: string;
  thumbnailUrl: string | null;

  sourceCreator: PublicProfile | null;
  clipper: PublicProfile | null;

  /** Decoded attribution payload, surfaced in the verified-badge dialog. */
  attribution: AttributionPayload | null;
  /** Raw JWT — useful for "copy token to verify externally" affordances. */
  attributionToken: string | null;

  /** First chunk of caption text — drives the OG description. */
  captionPreview: string | null;
}

export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Wrapped in `cache()` so a single render call (page + generateMetadata)
 * shares one DB round-trip per clipId. Cache lifetime is one request.
 */
export const getPublicClip = cache(_getPublicClip);

async function _getPublicClip(
  clipId: string,
): Promise<PublicClipData | null> {
  const supabase = createAdminClient();

  const { data: clip } = await supabase
    .from("clips")
    .select(
      "id, title, duration_seconds, created_at, view_count_total, vertical_video_r2_key, captions_json, attribution_signature, source_creator_profile_id, clipper_profile_id, visibility, deleted_at",
    )
    .eq("id", clipId)
    .eq("status", "ready")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .maybeSingle();

  if (!clip) return null;

  const profileIds = [
    clip.source_creator_profile_id,
    clip.clipper_profile_id,
  ].filter((id): id is string => Boolean(id));

  const profilesById = new Map<string, PublicProfile>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url")
      .in("id", profileIds);
    for (const p of profiles ?? []) {
      profilesById.set(p.id, {
        id: p.id,
        handle: p.handle,
        displayName: p.display_name,
        avatarUrl: p.avatar_url,
      });
    }
  }

  const verticalKey =
    clip.vertical_video_r2_key ?? StorageKeys.vertical(clip.id);
  const videoUrl = await getSignedDownloadUrl(verticalKey, 3600);

  let thumbnailUrl: string | null = null;
  try {
    thumbnailUrl = await getSignedDownloadUrl(
      StorageKeys.thumbnail(clip.id),
      3600,
    );
  } catch {
    // Thumbnail is best-effort — the reframe step generates it but
    // earlier failures may leave it absent. Falling back to null lets
    // the page render without an og:image rather than 500'ing.
  }

  const attribution = clip.attribution_signature
    ? safeDecodeAttribution(clip.attribution_signature)
    : null;

  return {
    id: clip.id,
    title:
      clip.title ??
      defaultTitle(profilesById.get(clip.source_creator_profile_id ?? "")),
    durationSeconds: clip.duration_seconds,
    createdAt: clip.created_at,
    viewCount: clip.view_count_total,
    videoUrl,
    thumbnailUrl,
    sourceCreator: clip.source_creator_profile_id
      ? profilesById.get(clip.source_creator_profile_id) ?? null
      : null,
    clipper: clip.clipper_profile_id
      ? profilesById.get(clip.clipper_profile_id) ?? null
      : null,
    attribution,
    attributionToken: clip.attribution_signature ?? null,
    captionPreview: extractCaptionPreview(clip.captions_json),
  };
}

function defaultTitle(creator: PublicProfile | undefined): string {
  if (creator?.handle) return `Clipped from @${creator.handle}`;
  return "A clip on Clipt";
}

function safeDecodeAttribution(token: string): AttributionPayload | null {
  try {
    const claims = decodeJwt(token);
    return {
      clipId: String(claims.clipId ?? claims.sub ?? ""),
      sourceChannelId:
        claims.sourceChannelId == null
          ? null
          : (claims.sourceChannelId as string),
      originalCreatorProfileId:
        claims.originalCreatorProfileId == null
          ? null
          : (claims.originalCreatorProfileId as string),
      sourcePlatform: String(claims.sourcePlatform ?? ""),
      sourceUrl: String(claims.sourceUrl ?? ""),
      sourceStartSec: Number(claims.sourceStartSec ?? 0),
      sourceEndSec: Number(claims.sourceEndSec ?? 0),
      issuedAt: String(claims.issuedAt ?? ""),
    };
  } catch {
    return null;
  }
}

function extractCaptionPreview(captionsJson: unknown): string | null {
  if (!captionsJson || typeof captionsJson !== "object") return null;
  const segments = (captionsJson as { segments?: unknown[] }).segments;
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const text = segments
    .map((s) =>
      s && typeof s === "object" && "text" in s
        ? String((s as { text: unknown }).text)
        : "",
    )
    .filter(Boolean)
    .join(" ")
    .trim();
  return text.length > 0 ? text : null;
}

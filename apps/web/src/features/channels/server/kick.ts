import "server-only";

/**
 * Kick doesn't have an OAuth-protected clips API at the time of writing —
 * the public clip JSON endpoint at https://kick.com/api/v2/clips/<slug>
 * returns the metadata + a direct mp4 url ('clip_url'/'video_url').
 *
 * We hit it without auth. If Kick later closes this off we'll switch to
 * scraping the embed page.
 */

export const KICK_CLIP_API = "https://kick.com/api/v2/clips";

export interface KickClipMeta {
  id: string;
  title: string;
  channelSlug: string;
  channelName: string;
  durationSeconds: number;
  /** Direct mp4 URL hosted on Kick's CDN. */
  mp4Url: string;
  /** Best-effort poster frame. */
  thumbnailUrl: string | null;
  viewCount: number;
}

interface KickClipResponse {
  clip: {
    id: string;
    livestream_id?: number;
    category_id?: number;
    channel_id?: number;
    user_id?: number;
    title?: string;
    duration?: number;
    thumbnail_url?: string | null;
    video_url?: string;
    clip_url?: string;
    view_count?: number;
    likes_count?: number;
    channel?: { slug?: string; username?: string };
  };
}

export async function fetchKickClipMeta(slug: string): Promise<KickClipMeta | null> {
  const url = `${KICK_CLIP_API}/${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    headers: {
      // Send a browser-like UA + JSON accept; Kick's public endpoint
      // sometimes returns Cloudflare challenge HTML on bare fetch.
      "user-agent":
        "Mozilla/5.0 (compatible; CliptBot/1.0; +https://clipt.live/bot)",
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`kick /api/v2/clips/${slug} failed: ${res.status} ${body.slice(0, 200)}`);
  }

  let json: KickClipResponse;
  try {
    json = (await res.json()) as KickClipResponse;
  } catch {
    throw new Error("kick /api/v2/clips returned non-JSON (CF challenge?)");
  }

  const clip = json.clip;
  if (!clip) return null;

  const mp4Url = clip.video_url ?? clip.clip_url;
  if (!mp4Url) {
    throw new Error("kick clip JSON missing video_url");
  }

  return {
    id: clip.id,
    title: clip.title ?? "Kick clip",
    channelSlug: clip.channel?.slug ?? "",
    channelName: clip.channel?.username ?? "",
    durationSeconds: clip.duration ?? 0,
    mp4Url,
    thumbnailUrl: clip.thumbnail_url ?? null,
    viewCount: clip.view_count ?? 0,
  };
}

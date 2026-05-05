import "server-only";

import type { SourceKind, SourcePlatform } from "../schema";

export interface ParsedClipUrl {
  platform: SourcePlatform;
  kind: SourceKind;
  /**
   * Platform-specific identifier extracted from the URL — clip slug, video
   * id, vod id, etc. Stored on the clip row so the download pipeline
   * (Prompt 1.7) can hit each platform's API by id without re-parsing.
   */
  sourceId: string;
  /** Canonical URL (no tracking params) for storage. */
  canonicalUrl: string;
}

export type ParseResult =
  | { ok: true; value: ParsedClipUrl }
  | { ok: false; error: string };

/**
 * Detect Clipt-supported source URLs and break them into the bits the
 * downstream pipeline needs.
 *
 * Recognized:
 *   twitch.tv/<channel>/clip/<slug>             -> twitch + clip
 *   clips.twitch.tv/<slug>                      -> twitch + clip
 *   twitch.tv/videos/<id>                       -> twitch + vod
 *   youtube.com/watch?v=<id>                    -> youtube + video
 *   youtu.be/<id>                               -> youtube + video
 *   youtube.com/shorts/<id>                     -> youtube + short
 *   m.youtube.com/* and youtube-nocookie.com/*  -> youtube (same shape)
 *   kick.com/<channel>/clips/<slug>             -> kick + clip
 *   kick.com/<channel>?clip=<slug>              -> kick + clip (alt)
 *
 * Everything else returns `{ ok: false }` with a human-readable error.
 */
export function parseClipUrl(input: string): ParseResult {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return { ok: false, error: "Couldn't parse that URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs are supported" };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = parsed.pathname.split("/").filter(Boolean);

  // ── Twitch ──────────────────────────────────────────────────────
  if (host === "twitch.tv" || host === "m.twitch.tv") {
    // /<channel>/clip/<slug>
    if (pathParts.length >= 3 && pathParts[1] === "clip") {
      const slug = pathParts[2];
      return {
        ok: true,
        value: {
          platform: "twitch",
          kind: "clip",
          sourceId: slug,
          canonicalUrl: `https://www.twitch.tv/${pathParts[0]}/clip/${slug}`,
        },
      };
    }
    // /videos/<id>
    if (pathParts.length >= 2 && pathParts[0] === "videos") {
      const vodId = pathParts[1];
      return {
        ok: true,
        value: {
          platform: "twitch",
          kind: "vod",
          sourceId: vodId,
          canonicalUrl: `https://www.twitch.tv/videos/${vodId}`,
        },
      };
    }
  }

  if (host === "clips.twitch.tv") {
    // clips.twitch.tv/<slug>
    if (pathParts.length >= 1) {
      const slug = pathParts[0];
      return {
        ok: true,
        value: {
          platform: "twitch",
          kind: "clip",
          sourceId: slug,
          canonicalUrl: `https://clips.twitch.tv/${slug}`,
        },
      };
    }
  }

  // ── YouTube ─────────────────────────────────────────────────────
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    // /shorts/<id>
    if (pathParts.length >= 2 && pathParts[0] === "shorts") {
      const id = pathParts[1];
      return {
        ok: true,
        value: {
          platform: "youtube",
          kind: "short",
          sourceId: id,
          canonicalUrl: `https://www.youtube.com/shorts/${id}`,
        },
      };
    }
    // /watch?v=…
    if (pathParts[0] === "watch") {
      const id = parsed.searchParams.get("v");
      if (id) {
        return {
          ok: true,
          value: {
            platform: "youtube",
            kind: "video",
            sourceId: id,
            canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
          },
        };
      }
    }
  }

  if (host === "youtu.be" && pathParts.length >= 1) {
    const id = pathParts[0];
    return {
      ok: true,
      value: {
        platform: "youtube",
        kind: "video",
        sourceId: id,
        canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
      },
    };
  }

  // ── Kick ────────────────────────────────────────────────────────
  if (host === "kick.com" || host === "m.kick.com") {
    // /<channel>/clips/<slug>
    if (pathParts.length >= 3 && pathParts[1] === "clips") {
      const slug = pathParts[2];
      return {
        ok: true,
        value: {
          platform: "kick",
          kind: "clip",
          sourceId: slug,
          canonicalUrl: `https://kick.com/${pathParts[0]}/clips/${slug}`,
        },
      };
    }
    // /<channel>?clip=<slug>  (their alt query-param form)
    if (pathParts.length >= 1) {
      const slug = parsed.searchParams.get("clip");
      if (slug) {
        return {
          ok: true,
          value: {
            platform: "kick",
            kind: "clip",
            sourceId: slug,
            canonicalUrl: `https://kick.com/${pathParts[0]}?clip=${slug}`,
          },
        };
      }
    }
  }

  return {
    ok: false,
    error:
      "Unsupported URL. Paste a Twitch clip/VOD, a YouTube video/short, or a Kick clip.",
  };
}

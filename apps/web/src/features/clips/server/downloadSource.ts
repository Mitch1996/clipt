import "server-only";

import { fetchKickClipMeta } from "@/features/channels/server/kick";
import { fetchTwitchClipMeta } from "@/features/channels/server/twitch";
import { putObject, StorageKeys } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";

import { parseClipUrl } from "./parseClipUrl";

const MAX_DURATION_SECONDS = 600; // 10 minutes — guard against accidentally pulling a long VOD

/**
 * Per-prompt-pack: certain source types are explicitly out of scope for
 * Phase 1 (Twitch VODs, every YouTube kind). We surface them as
 * UnsupportedSourceError so the calling Inngest function can flip the
 * row to status='failed' with a clear, user-facing message instead of
 * a generic stack trace.
 */
export class UnsupportedSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSourceError";
  }
}

/**
 * Generic download failure that is *not* a "phase scoping" error —
 * means the source URL was supported but something went wrong fetching
 * it (CDN error, deleted clip, network blip).
 */
export class SourceDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceDownloadError";
  }
}

export interface DownloadSourceResult {
  videoR2Key: string;
  durationSeconds: number;
  originalWidth: number | null;
  originalHeight: number | null;
  /** Resolved metadata we surface back to the clip row. */
  title: string | null;
  /**
   * Twitch / Kick broadcaster identifier so Phase 1.7+ can resolve the
   * original streamer and link the clip to its source channel.
   */
  sourceCreator: {
    platformUserId: string;
    platformUsername: string;
    platformLogin: string;
  } | null;
}

/**
 * Pull the source video for a clip into our object store.
 *
 * Phase 1 supports:
 *   ✓ Twitch clips     (Helix /clips → derive mp4 URL → stream)
 *   ✓ Kick clips       (kick.com/api/v2/clips/<slug> → mp4 URL → stream)
 *   ✗ Twitch VODs      (UnsupportedSourceError; arrives in Phase 2 via the Fly.io worker + yt-dlp)
 *   ✗ YouTube anything (same — Phase 2)
 *
 * The download buffers the whole mp4 in memory before uploading; clip
 * sources are short (< 60s for Twitch clips, capped here at 10 min).
 * Streaming straight into Supabase Storage isn't supported by the
 * client SDK today, so we go via Buffer.
 */
export async function downloadSource(
  clipId: string,
  sourceUrl: string,
): Promise<DownloadSourceResult> {
  const detection = parseClipUrl(sourceUrl);
  if (!detection.ok) {
    throw new SourceDownloadError(detection.error);
  }
  const { platform, kind, sourceId } = detection.value;

  // Phase 1 scope guards
  if (platform === "twitch" && kind === "vod") {
    throw new UnsupportedSourceError(
      "Twitch VODs are coming soon — please use a Twitch clip URL instead.",
    );
  }
  if (platform === "youtube") {
    throw new UnsupportedSourceError(
      "YouTube sources arrive in Phase 2 once the video worker is live. Try a Twitch or Kick clip for now.",
    );
  }

  if (platform === "twitch" && kind === "clip") {
    return downloadTwitchClip(clipId, sourceId);
  }
  if (platform === "kick" && kind === "clip") {
    return downloadKickClip(clipId, sourceId);
  }

  throw new UnsupportedSourceError(
    `${platform}/${kind} sources aren't supported yet.`,
  );
}

async function downloadTwitchClip(
  clipId: string,
  slug: string,
): Promise<DownloadSourceResult> {
  const meta = await fetchTwitchClipMeta(slug);
  if (!meta) {
    throw new SourceDownloadError("Twitch clip not found (deleted or private?)");
  }
  if (meta.durationSeconds > MAX_DURATION_SECONDS) {
    throw new SourceDownloadError("Source too long for V1");
  }

  const buf = await streamToBuffer(meta.mp4Url);
  const key = StorageKeys.source(clipId);
  await putObject(key, buf, "video/mp4");

  // Persist the broadcaster on the clip row so the public clip page can
  // render @<login>. We also flag a TODO: if a profile exists for this
  // broadcaster we should set source_creator_profile_id (Prompt 1.11
  // does that as part of attribution signing).
  await persistTitle(clipId, meta.title);

  return {
    videoR2Key: key,
    durationSeconds: meta.durationSeconds,
    originalWidth: null,
    originalHeight: null,
    title: meta.title,
    sourceCreator: {
      platformUserId: meta.broadcasterId,
      platformUsername: meta.broadcasterName,
      platformLogin: meta.broadcasterLogin,
    },
  };
}

async function downloadKickClip(
  clipId: string,
  slug: string,
): Promise<DownloadSourceResult> {
  const meta = await fetchKickClipMeta(slug);
  if (!meta) {
    throw new SourceDownloadError("Kick clip not found (deleted or private?)");
  }
  if (meta.durationSeconds > MAX_DURATION_SECONDS) {
    throw new SourceDownloadError("Source too long for V1");
  }

  const buf = await streamToBuffer(meta.mp4Url);
  const key = StorageKeys.source(clipId);
  await putObject(key, buf, "video/mp4");

  await persistTitle(clipId, meta.title);

  return {
    videoR2Key: key,
    durationSeconds: meta.durationSeconds,
    originalWidth: null,
    originalHeight: null,
    title: meta.title,
    sourceCreator: meta.channelSlug
      ? {
          platformUserId: meta.id,
          platformUsername: meta.channelName,
          platformLogin: meta.channelSlug,
        }
      : null,
  };
}

async function streamToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; CliptBot/1.0; +https://clipt.tv/bot)",
    },
  });
  if (!res.ok) {
    throw new SourceDownloadError(
      `mp4 fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

async function persistTitle(clipId: string, title: string) {
  const supabase = createAdminClient();
  // Only set the title if the clip doesn't already have one (the user's
  // editor would have set it manually; don't clobber).
  await supabase
    .from("clips")
    .update({ title })
    .eq("id", clipId)
    .is("title", null);
}

import "server-only";

import { isTikTokConfigured } from "@/features/channels/server/tiktok";

import type { PublishInput, PublishOutcome } from "../schema";

/**
 * Stub for TikTok posting. The OAuth flow is wired
 * (apps/web/src/app/api/oauth/tiktok/{start,callback}) but actual
 * Content Posting API access requires:
 *   1. TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET in env (sandbox app
 *      from developers.tiktok.com is enough to test)
 *   2. The user's TikTok account approved via the sandbox audit OR
 *      a Production app with the `video.publish` scope reviewed
 *
 * Real implementation will:
 *   - PUT init: POST https://open.tiktokapis.com/v2/post/publish/video/init/
 *     with { post_info, source_info: { source: "FILE_UPLOAD",
 *     video_size, chunk_size, total_chunk_count } }
 *   - PUT chunks to the returned upload_url
 *   - Poll /v2/post/publish/status/fetch/?publish_id=…
 *   - Insert clip_posts row with platform='tiktok'
 */
export async function postToTikTok(_input: PublishInput): Promise<PublishOutcome> {
  return {
    ok: false,
    platformConfigured: isTikTokConfigured(),
    error: isTikTokConfigured()
      ? "TikTok posting isn't implemented yet — the OAuth flow is ready, the upload pipeline lands once the app passes audit."
      : "Add TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET to .env.local first (developers.tiktok.com).",
  };
}

export async function syncTikTokStats(
  _channelId: string,
  _platformPostId: string,
): Promise<{ viewCount: number; likeCount: number } | null> {
  return null;
}

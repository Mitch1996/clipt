import "server-only";

import { isInstagramConfigured } from "@/features/channels/server/instagram";

import type { PublishInput, PublishOutcome } from "../schema";

/**
 * Stub for Instagram Reels posting. The OAuth flow is wired but
 * actually posting Reels requires:
 *   1. INSTAGRAM_CLIENT_ID + INSTAGRAM_CLIENT_SECRET in env (Meta app)
 *   2. Meta app with `instagram_content_publish` permission — this
 *      goes through Meta's app review process which can take days
 *   3. The user's IG must be a Business or Creator account linked to
 *      a Facebook Page they manage
 *
 * Real implementation will be a 3-step container flow:
 *   1. POST /{ig-user-id}/media with { media_type: "REELS",
 *      video_url, caption, share_to_feed } -> returns container id
 *   2. Poll /{container-id}?fields=status_code until FINISHED
 *   3. POST /{ig-user-id}/media_publish with { creation_id }
 *      -> returns the media id (the platform_post_id)
 *
 * The video_url in step 1 must be a publicly fetchable URL — for us
 * that means a signed-download URL with at least 60s of TTL pointing
 * at the vertical mp4 in storage.
 */
export async function postToInstagramReels(
  _input: PublishInput,
): Promise<PublishOutcome> {
  return {
    ok: false,
    platformConfigured: isInstagramConfigured(),
    error: isInstagramConfigured()
      ? "Instagram Reels posting isn't implemented yet — the OAuth flow is ready, the container/publish dance lands once the Meta app passes review."
      : "Add INSTAGRAM_CLIENT_ID + INSTAGRAM_CLIENT_SECRET to .env.local first (developers.facebook.com).",
  };
}

export async function syncInstagramStats(
  _channelId: string,
  _platformPostId: string,
): Promise<{ viewCount: number; likeCount: number } | null> {
  return null;
}

import { syncInstagramStats } from "@/features/publishing/server/postToInstagramReels";
import { syncTikTokStats } from "@/features/publishing/server/postToTikTok";
import { syncYouTubeShortStats } from "@/features/publishing/server/postToYouTubeShorts";
import { createAdminClient } from "@/lib/supabase/admin";

import { inngest } from "../client";

/**
 * Cron — every 30 minutes, refresh view + like counts for posts
 * created in the last 7 days. The platform-specific helpers swallow
 * errors and return null when the scope isn't authorized; we just
 * skip those rows for this tick and try again next time.
 */
export const syncPostStats = inngest.createFunction(
  {
    id: "sync-post-stats",
    retries: 1,
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: posts } = await step.run("load-posts", async () => {
      return supabase
        .from("clip_posts")
        .select(
          "id, platform, platform_post_id, posted_by_profile_id, last_synced_at",
        )
        .not("platform_post_id", "is", null)
        .gte("created_at", sevenDaysAgo)
        .limit(500);
    });

    if (!posts || posts.length === 0) {
      return { synced: 0 };
    }

    let synced = 0;
    for (const post of posts) {
      const updated = await step.run(`sync-${post.id}`, async () => {
        // Find the channel for this platform owned by the poster so
        // the per-platform helper has a token row to read from.
        if (!post.posted_by_profile_id) return null;
        const channelPlatform =
          post.platform === "youtube_shorts" ? "youtube" : post.platform;
        const { data: channel } = await supabase
          .from("channels")
          .select("id")
          .eq("owner_id", post.posted_by_profile_id)
          .eq("platform", channelPlatform)
          .not("access_token_encrypted", "is", null)
          .maybeSingle();
        if (!channel || !post.platform_post_id) return null;

        let stats: { viewCount: number; likeCount: number } | null = null;
        switch (post.platform) {
          case "youtube_shorts":
            stats = await syncYouTubeShortStats(channel.id, post.platform_post_id);
            break;
          case "tiktok":
            stats = await syncTikTokStats(channel.id, post.platform_post_id);
            break;
          case "instagram":
            stats = await syncInstagramStats(channel.id, post.platform_post_id);
            break;
        }
        if (!stats) return null;

        await supabase
          .from("clip_posts")
          .update({
            view_count: stats.viewCount,
            like_count: stats.likeCount,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", post.id);
        return stats;
      });
      if (updated) synced++;
    }

    return { synced, total: posts.length };
  },
);

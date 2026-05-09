"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { publishInputSchema, type PublishInput, type PublishOutcome } from "../schema";
import { postToInstagramReels, syncInstagramStats } from "./postToInstagramReels";
import { postToTikTok, syncTikTokStats } from "./postToTikTok";
import { postToYouTubeShorts, syncYouTubeShortStats } from "./postToYouTubeShorts";

export type SubmitPublishResult =
  | { ok: true; postId: string; url: string | null; scheduled: boolean }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof PublishInput, string>> };

/**
 * Entry point for the PostDialog. Validates, then either:
 *   - schedules a delayed publish via inngest (when scheduledFor is set)
 *   - or runs the platform-specific publish function inline
 */
export async function submitPublish(
  input: PublishInput,
): Promise<SubmitPublishResult> {
  const parsed = publishInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof PublishInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof PublishInput;
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  // Schedule path — defer to Inngest, return a placeholder clip_post row.
  if (parsed.data.scheduledFor) {
    const scheduledAt = new Date(parsed.data.scheduledFor);
    if (scheduledAt.getTime() < Date.now() + 30_000) {
      return {
        ok: false,
        error: "Schedule a time at least 30 seconds in the future.",
        fieldErrors: { scheduledFor: "Pick a future time." },
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in" };

    // Insert a placeholder clip_post row (no platform_post_id yet) so
    // the UI can show "Scheduled for …" and the publish handler has a
    // row to update on success.
    const { data: row, error } = await supabase
      .from("clip_posts")
      .insert({
        clip_id: parsed.data.clipId,
        platform: parsed.data.platform,
        platform_post_id: null,
        posted_by_profile_id: user.id,
        scheduled_for: scheduledAt.toISOString(),
      })
      .select("id")
      .single();
    if (error || !row) {
      return { ok: false, error: error?.message ?? "Couldn't schedule the post." };
    }

    await inngest.send({
      name: "publish/scheduled",
      data: {
        postId: row.id,
        input: parsed.data,
        scheduledFor: scheduledAt.toISOString(),
      },
    });

    revalidatePath(`/dashboard/clips/${parsed.data.clipId}`);
    return { ok: true, postId: row.id, url: null, scheduled: true };
  }

  // Immediate path — call the platform action right now.
  const outcome = await runPublish(parsed.data);
  if (!outcome.ok) return { ok: false, error: outcome.error };

  revalidatePath(`/dashboard/clips/${parsed.data.clipId}`);
  return { ok: true, postId: outcome.postId, url: outcome.url, scheduled: false };
}

/**
 * Internal dispatch — picks the right per-platform function. Used by
 * `submitPublish` (immediate path) and the Inngest scheduled handler.
 */
export async function runPublish(input: PublishInput): Promise<PublishOutcome> {
  switch (input.platform) {
    case "youtube_shorts":
      return postToYouTubeShorts(input);
    case "tiktok":
      return postToTikTok(input);
    case "instagram":
      return postToInstagramReels(input);
  }
}

/** Cancel a scheduled clip_post that hasn't fired yet. */
export async function cancelScheduledPost(
  postId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Only delete if it hasn't been published yet (platform_post_id is null).
  const { error } = await supabase
    .from("clip_posts")
    .delete()
    .eq("id", postId)
    .eq("posted_by_profile_id", user.id)
    .is("platform_post_id", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Manually re-fetch view + like counts for a post. */
export async function syncPostStatsNow(
  postId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: post } = await supabase
    .from("clip_posts")
    .select("id, platform, platform_post_id, posted_by_profile_id, clip_id")
    .eq("id", postId)
    .single();

  if (!post || post.posted_by_profile_id !== user.id) {
    return { ok: false, error: "Post not found." };
  }
  if (!post.platform_post_id) {
    return { ok: false, error: "Post hasn't been published yet." };
  }

  // Find the channel for this platform owned by the user, so the
  // refresh-aware token accessor has a row to read from.
  const channelPlatform = post.platform === "youtube_shorts" ? "youtube" : post.platform;
  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("owner_id", user.id)
    .eq("platform", channelPlatform)
    .not("access_token_encrypted", "is", null)
    .maybeSingle();
  if (!channel) {
    return { ok: false, error: `Connect your ${channelPlatform} account first.` };
  }

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

  if (!stats) {
    return { ok: false, error: "Couldn't fetch fresh stats." };
  }

  // We use admin to bypass any per-user write policies on the row —
  // sync is a system action.
  const admin = createAdminClient();
  await admin
    .from("clip_posts")
    .update({
      view_count: stats.viewCount,
      like_count: stats.likeCount,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", post.id);

  revalidatePath(`/dashboard/clips/${post.clip_id}`);
  return { ok: true };
}

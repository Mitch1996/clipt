import { NonRetriableError } from "inngest";

import { runPublish } from "@/features/publishing/server/actions";
import { createAdminClient } from "@/lib/supabase/admin";

import { PublishScheduled, inngest } from "../client";

/**
 * Fires for every `publish/scheduled` event. Sleeps until the
 * `scheduledFor` instant, then runs the platform-specific upload and
 * patches the placeholder clip_posts row with the resulting
 * platform_post_id + posted_at.
 *
 * If the placeholder row was deleted in the meantime (the user
 * cancelled), we abort cleanly with a NonRetriableError so the
 * Inngest dashboard shows it as a finished cancel rather than a
 * failure.
 */
export const publishScheduledPost = inngest.createFunction(
  {
    id: "publish-scheduled-post",
    retries: 1,
    triggers: [PublishScheduled],
  },
  async ({ event, step }) => {
    const { postId, input, scheduledFor } = event.data;

    await step.sleepUntil("wait-for-scheduled-time", new Date(scheduledFor));

    // Confirm the placeholder still exists + hasn't been published.
    const ok = await step.run("verify-placeholder", async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("clip_posts")
        .select("id, platform_post_id")
        .eq("id", postId)
        .maybeSingle();
      return !!data && !data.platform_post_id;
    });
    if (!ok) {
      throw new NonRetriableError(
        `clip_post ${postId} no longer schedulable (cancelled or already published).`,
      );
    }

    const outcome = await step.run("publish", () => runPublish(input));
    if (!outcome.ok) {
      // Mark the placeholder as failed in last_synced_at so the UI can
      // surface the error inline. We don't have a status column on
      // clip_posts; the convention is "no platform_post_id + a recent
      // last_synced_at + scheduled_for in the past" => failed.
      await step.run("mark-failed", async () => {
        const admin = createAdminClient();
        await admin
          .from("clip_posts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", postId);
      });
      throw new NonRetriableError(`publish failed: ${outcome.error}`);
    }

    await step.run("patch-placeholder", async () => {
      const admin = createAdminClient();
      await admin
        .from("clip_posts")
        .update({
          platform_post_id: outcome.platformPostId,
          posted_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", postId);
    });

    return { postId, platformPostId: outcome.platformPostId, url: outcome.url };
  },
);

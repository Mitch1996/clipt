"use server";

import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

export type TriggerResult =
  | { ok: true; clipId: string }
  | { ok: false; error: string };

/**
 * Insert a dummy clip row + send `clip/requested` to Inngest. The dev
 * UI's job timeline will show the function moving through every step
 * and flipping the row from pending → processing → ready.
 *
 * Uses the service-role admin client because there's no user-facing
 * "clipped a thing" yet — this is a developer trigger.
 */
export async function triggerTestClip(): Promise<TriggerResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("clips")
    .insert({
      title: "[dev] processClip smoke test",
      source_url: "https://example.com/dev-test",
      source_platform: "twitch",
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("triggerTestClip insert failed:", error);
    return { ok: false, error: error?.message ?? "Insert failed" };
  }

  await inngest.send({
    name: "clip/requested",
    data: { clipId: data.id },
  });

  return { ok: true, clipId: data.id };
}

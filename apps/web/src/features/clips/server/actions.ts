"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { inngest } from "@/inngest/client";
import { createClient } from "@/lib/supabase/server";

import { pasteUrlSchema, type PasteUrlInput } from "../schema";
import { parseClipUrl } from "./parseClipUrl";

export type CreateClipResult =
  | { ok: true; clipId: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof PasteUrlInput, string>> };

export async function createClipFromUrl(
  input: PasteUrlInput,
): Promise<CreateClipResult> {
  const parsed = pasteUrlSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof PasteUrlInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof PasteUrlInput;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const detection = parseClipUrl(parsed.data.sourceUrl);
  if (!detection.ok) {
    return {
      ok: false,
      error: detection.error,
      fieldErrors: { sourceUrl: detection.error },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { canonicalUrl, platform, kind } = detection.value;

  // Insert with the clipper but DON'T pre-fill source_channel_id —
  // that's the *broadcaster's* connected channel, which we can only
  // resolve after the download step pulls the broadcaster's
  // platform_user_id. Pre-filling with the clipper's own channel
  // (Prompt 1.5's original logic) was wrong: most paste-URL flows
  // clip from streamers who aren't the clipper. The Inngest pipeline's
  // `resolve-source-creator` step now sets both source_channel_id +
  // source_creator_profile_id consistently.
  const { data: clip, error: insertErr } = await supabase
    .from("clips")
    .insert({
      source_url: canonicalUrl,
      source_platform: platform,
      source_kind: kind,
      clipper_profile_id: user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !clip) {
    console.error("createClipFromUrl insert failed:", insertErr);
    return { ok: false, error: insertErr?.message ?? "Insert failed" };
  }

  await inngest.send({ name: "clip/requested", data: { clipId: clip.id } });

  return { ok: true, clipId: clip.id };
}

export type RetryClipResult = { ok: true } | { ok: false; error: string };

export async function retryClip(clipId: string): Promise<RetryClipResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // RLS already enforces owner check (source creator OR clipper); reset
  // the row to pending and re-fire the event.
  const { error } = await supabase
    .from("clips")
    .update({ status: "pending", processing_error: null })
    .eq("id", clipId);
  if (error) {
    console.error("retryClip update failed:", error);
    return { ok: false, error: error.message };
  }

  await inngest.send({ name: "clip/requested", data: { clipId } });

  revalidatePath(`/dashboard/clips/${clipId}`);
  return { ok: true };
}

/**
 * Server action wrapper used by the New-Clip form. Runs the create flow
 * and, on success, redirects to the clip detail page.
 */
export async function createClipAndRedirect(input: PasteUrlInput) {
  const result = await createClipFromUrl(input);
  if (result.ok) {
    redirect(`/dashboard/clips/${result.clipId}`);
  }
  return result;
}

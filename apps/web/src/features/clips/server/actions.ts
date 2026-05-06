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

  // Try to find an existing connected channel of the same platform owned
  // by the current user — lets us light up the clip → channel link from
  // day one. If none, source_channel_id stays null until the source
  // creator is actually identified by Prompt 1.7's metadata fetch.
  const { data: ownedChannel } = await supabase
    .from("channels")
    .select("id")
    .eq("owner_id", user.id)
    .eq("platform", platform)
    .not("access_token_encrypted", "is", null)
    .maybeSingle();

  const { data: clip, error: insertErr } = await supabase
    .from("clips")
    .insert({
      source_url: canonicalUrl,
      source_platform: platform,
      source_kind: kind,
      source_channel_id: ownedChannel?.id ?? null,
      // The current user is the *clipper* (the person who initiated this
      // clip). source_creator_profile_id stays null until the pipeline
      // resolves the original streamer in a later prompt.
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

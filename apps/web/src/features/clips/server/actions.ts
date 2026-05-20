"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";

import { canCreateClip } from "@/lib/billing/entitlements";
import { inngest } from "@/inngest/client";
import { createClient } from "@/lib/supabase/server";

import {
  captionsJsonSchema,
  pasteUrlSchema,
  updateClipMetaSchema,
  type CaptionsJson,
  type PasteUrlInput,
  type UpdateClipMetaInput,
} from "../schema";
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

  // Free-tier clip cap (Prompt 1.15). Paid tiers short-circuit to ok=true.
  const gate = await canCreateClip(user.id);
  if (!gate.ok) {
    return {
      ok: false,
      error: `You've hit the free-tier limit of ${gate.limit} clips this month. Upgrade to Creator for unlimited clips.`,
    };
  }

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

// ─── Editor mutations (Prompt 1.13) ──────────────────────────────────

export type SimpleResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Persist edited captions and re-fire the reframe pipeline so the
 * burned-in captions on the vertical mp4 update.
 */
export async function updateClipCaptions(
  clipId: string,
  captionsJson: unknown,
): Promise<SimpleResult> {
  const parsed = captionsJsonSchema.safeParse(captionsJson);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid captions" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // RLS gates the row to source-creator OR clipper. The update returns
  // 0 rows for anyone else, which we surface as a forbidden error.
  const { data, error } = await supabase
    .from("clips")
    .update({
      captions_json: parsed.data as unknown as CaptionsJson,
      status: "processing",
      processing_error: null,
    })
    .eq("id", clipId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not found or not yours" };

  await inngest.send({
    name: "clip/captions-updated",
    data: { clipId },
  });

  revalidatePath(`/dashboard/clips/${clipId}`);
  revalidateTag(`clip:${clipId}`);
  return { ok: true };
}

/**
 * Update the editable clip metadata (title + visibility). Both fields
 * are optional — the action only writes the keys that are present.
 */
export async function updateClipMeta(
  clipId: string,
  input: UpdateClipMetaInput,
): Promise<SimpleResult> {
  const parsed = updateClipMetaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.title === undefined && parsed.data.visibility === undefined) {
    return { ok: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const patch: { title?: string; visibility?: string } = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.visibility !== undefined) patch.visibility = parsed.data.visibility;

  const { data, error } = await supabase
    .from("clips")
    .update(patch)
    .eq("id", clipId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not found or not yours" };

  revalidatePath(`/dashboard/clips/${clipId}`);
  revalidateTag(`clip:${clipId}`);
  return { ok: true };
}

/**
 * Soft-delete: stamp `deleted_at`. The row stays in the DB and the R2
 * artifacts stay in storage; a future cron purges blobs after a
 * retention window.
 */
export async function softDeleteClip(clipId: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase
    .from("clips")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", clipId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not found or not yours" };

  revalidatePath(`/dashboard/clips`);
  revalidateTag(`clip:${clipId}`);
  return { ok: true };
}

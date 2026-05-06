"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type DisconnectResult = { ok: true } | { ok: false; error: string };

/**
 * Soft-disconnect a channel: clear the encrypted tokens and expires-at,
 * keeping the row + history intact so re-connection upserts onto the
 * same id (preserves clip references etc.).
 */
export async function disconnectChannel(channelId: string): Promise<DisconnectResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("channels")
    .update({
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", channelId)
    .eq("owner_id", user.id);

  if (error) {
    console.error("disconnectChannel failed:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/channels");
  return { ok: true };
}

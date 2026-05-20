"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FaceCamCorner =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right"
  | null;

const VALID_CORNERS: ReadonlyArray<Exclude<FaceCamCorner, null>> = [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
];

export async function setFaceCamCorner(
  channelId: string,
  corner: FaceCamCorner,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (corner !== null && !VALID_CORNERS.includes(corner)) {
    return { ok: false, error: "Invalid corner value" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Use admin client + explicit owner check rather than relying on
  // RLS — the channels update policy currently scopes to owner, and we
  // want a consistent error message for "not yours".
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("channels")
    .select("owner_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Channel not found" };
  if (row.owner_id !== user.id) return { ok: false, error: "Not yours" };

  const { error } = await admin
    .from("channels")
    .update({ face_cam_corner: corner })
    .eq("id", channelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/channels");
  revalidatePath("/dashboard/admin/watch");
  return { ok: true };
}

import { NextResponse, type NextRequest } from "next/server";

import { encrypt } from "@/lib/crypto/encryption";
import { createClient } from "@/lib/supabase/server";
import {
  TIKTOK_SCOPES,
  exchangeCodeForTokens,
  fetchTikTokUser,
} from "@/features/channels/server/tiktok";

const STATE_COOKIE = "clipt_tiktok_oauth_state";

function back(
  origin: string,
  status: "ok" | "denied" | "state_mismatch" | "error",
  detail?: string,
) {
  const url = new URL(`${origin}/dashboard/channels`);
  url.searchParams.set("tiktok", status);
  if (detail) url.searchParams.set("detail", detail);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam || !code || !stateParam) {
    return back(origin, "denied", errorParam ?? undefined);
  }

  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieState || cookieState !== stateParam) {
    return back(origin, "state_mismatch");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`${origin}/auth/login?next=/dashboard/channels`),
    );
  }

  let tokens, ttUser;
  try {
    tokens = await exchangeCodeForTokens(code);
    ttUser = await fetchTikTokUser(tokens.access_token);
  } catch (err) {
    console.error("tiktok oauth callback failed:", err);
    return back(origin, "error", "exchange_failed");
  }

  // Hijack guard
  const { data: existing } = await supabase
    .from("channels")
    .select("id, owner_id")
    .eq("platform", "tiktok")
    .eq("platform_user_id", ttUser.open_id)
    .maybeSingle();

  if (existing && existing.owner_id !== user.id) {
    return back(origin, "error", "channel_owned_by_other_user");
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: upsertErr } = await supabase
    .from("channels")
    .upsert(
      {
        owner_id: user.id,
        platform: "tiktok",
        platform_user_id: ttUser.open_id,
        platform_username: ttUser.display_name ?? ttUser.username ?? "TikTok",
        access_token_encrypted: encrypt(tokens.access_token),
        refresh_token_encrypted: encrypt(tokens.refresh_token),
        scopes: tokens.scope ? tokens.scope.split(",") : [...TIKTOK_SCOPES],
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "platform,platform_user_id" },
    );

  if (upsertErr) {
    console.error("tiktok channels upsert failed:", upsertErr);
    return back(origin, "error", "db_upsert_failed");
  }

  const response = back(origin, "ok", ttUser.display_name ?? ttUser.username);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

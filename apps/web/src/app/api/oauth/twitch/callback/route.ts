import { NextResponse, type NextRequest } from "next/server";

import { encrypt } from "@/lib/crypto/encryption";
import { createClient } from "@/lib/supabase/server";
import {
  TWITCH_SCOPES,
  exchangeCodeForTokens,
  fetchTwitchUser,
} from "@/features/channels/server/twitch";

const STATE_COOKIE = "clipt_twitch_oauth_state";

function back(origin: string, status: "ok" | "denied" | "state_mismatch" | "error", detail?: string) {
  const url = new URL(`${origin}/dashboard/channels`);
  url.searchParams.set("twitch", status);
  if (detail) url.searchParams.set("detail", detail);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // 1. The user explicitly denied or Twitch returned an error
  if (errorParam || !code || !stateParam) {
    return back(origin, "denied", errorParam ?? undefined);
  }

  // 2. Verify state cookie matches the state param (CSRF protection)
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieState || cookieState !== stateParam) {
    return back(origin, "state_mismatch");
  }

  // 3. Authenticate the in-app user (the row's owner_id MUST be them, not
  //    inferred from the Twitch account, to prevent account hijacking).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`${origin}/auth/login?next=/dashboard/channels`),
    );
  }

  // 4. Exchange the code + fetch the Twitch user
  let tokens, twitchUser;
  try {
    tokens = await exchangeCodeForTokens(code);
    twitchUser = await fetchTwitchUser(tokens.access_token);
  } catch (err) {
    console.error("twitch oauth callback failed:", err);
    return back(origin, "error", "exchange_failed");
  }

  // 5. Hijack guard: if the row exists with a different owner, reject.
  const { data: existing } = await supabase
    .from("channels")
    .select("id, owner_id")
    .eq("platform", "twitch")
    .eq("platform_user_id", twitchUser.id)
    .maybeSingle();

  if (existing && existing.owner_id !== user.id) {
    return back(origin, "error", "channel_owned_by_other_user");
  }

  // 6. Encrypt tokens and upsert (insert or refresh-the-row).
  const accessTokenEncrypted = encrypt(tokens.access_token);
  const refreshTokenEncrypted = encrypt(tokens.refresh_token);

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: upsertErr } = await supabase
    .from("channels")
    .upsert(
      {
        owner_id: user.id,
        platform: "twitch",
        platform_user_id: twitchUser.id,
        platform_username: twitchUser.display_name ?? twitchUser.login,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        scopes: tokens.scope?.length ? tokens.scope : [...TWITCH_SCOPES],
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "platform,platform_user_id" },
    );

  if (upsertErr) {
    console.error("channels upsert failed:", upsertErr);
    return back(origin, "error", "db_upsert_failed");
  }

  // 7. Clear the state cookie and redirect.
  const response = back(origin, "ok", twitchUser.display_name ?? twitchUser.login);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

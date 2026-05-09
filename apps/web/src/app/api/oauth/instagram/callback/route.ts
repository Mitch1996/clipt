import { NextResponse, type NextRequest } from "next/server";

import { encrypt } from "@/lib/crypto/encryption";
import { createClient } from "@/lib/supabase/server";
import {
  INSTAGRAM_SCOPES,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramAccount,
} from "@/features/channels/server/instagram";

const STATE_COOKIE = "clipt_instagram_oauth_state";

function back(
  origin: string,
  status: "ok" | "denied" | "state_mismatch" | "error",
  detail?: string,
) {
  const url = new URL(`${origin}/dashboard/channels`);
  url.searchParams.set("instagram", status);
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

  let igUser, longLived;
  try {
    const shortLived = await exchangeCodeForToken(code);
    longLived = await exchangeForLongLivedToken(shortLived.access_token);
    igUser = await fetchInstagramAccount(longLived.access_token);
  } catch (err) {
    console.error("instagram oauth callback failed:", err);
    return back(
      origin,
      "error",
      err instanceof Error ? err.message.slice(0, 80) : "exchange_failed",
    );
  }

  // Hijack guard
  const { data: existing } = await supabase
    .from("channels")
    .select("id, owner_id")
    .eq("platform", "instagram")
    .eq("platform_user_id", igUser.id)
    .maybeSingle();

  if (existing && existing.owner_id !== user.id) {
    return back(origin, "error", "channel_owned_by_other_user");
  }

  // Long-lived FB tokens are 60 days. No refresh token in this flow —
  // the app must redo the OAuth dance before the 60d are up.
  const expiresAt = longLived.expires_in
    ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
    : null;

  const { error: upsertErr } = await supabase
    .from("channels")
    .upsert(
      {
        owner_id: user.id,
        platform: "instagram",
        platform_user_id: igUser.id,
        platform_username: igUser.username,
        access_token_encrypted: encrypt(longLived.access_token),
        refresh_token_encrypted: null, // no refresh token on the long-lived flow
        scopes: [...INSTAGRAM_SCOPES],
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "platform,platform_user_id" },
    );

  if (upsertErr) {
    console.error("instagram channels upsert failed:", upsertErr);
    return back(origin, "error", "db_upsert_failed");
  }

  const response = back(origin, "ok", igUser.username);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

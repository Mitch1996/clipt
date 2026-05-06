import { NextResponse, type NextRequest } from "next/server";

import { encrypt } from "@/lib/crypto/encryption";
import { createClient } from "@/lib/supabase/server";
import {
  YOUTUBE_SCOPES,
  exchangeCodeForTokens,
  fetchYouTubeChannel,
} from "@/features/channels/server/youtube";

const STATE_COOKIE = "clipt_youtube_oauth_state";

function back(
  origin: string,
  status: "ok" | "denied" | "state_mismatch" | "error",
  detail?: string,
) {
  const url = new URL(`${origin}/dashboard/channels`);
  url.searchParams.set("youtube", status);
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

  let tokens, channel;
  try {
    tokens = await exchangeCodeForTokens(code);
    channel = await fetchYouTubeChannel(tokens.access_token);
  } catch (err) {
    console.error("youtube oauth callback failed:", err);
    return back(origin, "error", "exchange_failed");
  }

  // Hijack guard
  const { data: existing } = await supabase
    .from("channels")
    .select("id, owner_id, refresh_token_encrypted")
    .eq("platform", "youtube")
    .eq("platform_user_id", channel.id)
    .maybeSingle();

  if (existing && existing.owner_id !== user.id) {
    return back(origin, "error", "channel_owned_by_other_user");
  }

  // Google's refresh_token is one-shot on first consent. We force prompt=consent
  // on every authorize so it should always be present, but if it's not (e.g.
  // user reconnecting from a prior consent), preserve the previously stored
  // refresh token rather than losing it.
  const refreshTokenPlain = tokens.refresh_token;
  const accessTokenEncrypted = encrypt(tokens.access_token);
  const refreshTokenEncrypted = refreshTokenPlain
    ? encrypt(refreshTokenPlain)
    : (existing?.refresh_token_encrypted ?? null);

  if (!refreshTokenEncrypted) {
    console.warn(
      "youtube oauth: no refresh_token returned and none on file — channel will need re-consent",
    );
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const grantedScopes = tokens.scope ? tokens.scope.split(" ") : [...YOUTUBE_SCOPES];

  const { error: upsertErr } = await supabase
    .from("channels")
    .upsert(
      {
        owner_id: user.id,
        platform: "youtube",
        platform_user_id: channel.id,
        platform_username: channel.snippet.title,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        scopes: grantedScopes,
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "platform,platform_user_id" },
    );

  if (upsertErr) {
    console.error("youtube channels upsert failed:", upsertErr);
    return back(origin, "error", "db_upsert_failed");
  }

  const response = back(origin, "ok", channel.snippet.title);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

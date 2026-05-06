import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  TWITCH_AUTH_URL,
  TWITCH_SCOPES,
  getTwitchEnv,
} from "@/features/channels/server/twitch";

const STATE_COOKIE = "clipt_twitch_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 minutes is plenty for an OAuth round-trip

export async function GET() {
  // Connecting a channel is an authenticated action.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const url = new URL(
      `${process.env.NEXT_PUBLIC_APP_URL}/auth/login?next=/dashboard/channels`,
    );
    return NextResponse.redirect(url);
  }

  const { clientId, redirectUri } = getTwitchEnv();
  const state = randomBytes(32).toString("hex");

  const authorizeUrl = new URL(TWITCH_AUTH_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", TWITCH_SCOPES.join(" "));
  authorizeUrl.searchParams.set("state", state);
  // force_verify lets the user pick a different Twitch account on reconnect
  authorizeUrl.searchParams.set("force_verify", "true");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/api/oauth/twitch",
  });
  return response;
}

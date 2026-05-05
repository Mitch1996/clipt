import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  GOOGLE_AUTH_URL,
  YOUTUBE_SCOPES,
  getYouTubeEnv,
} from "@/features/channels/server/youtube";

const STATE_COOKIE = "clipt_youtube_oauth_state";
const STATE_TTL_SECONDS = 600;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`${process.env.NEXT_PUBLIC_APP_URL}/auth/login?next=/dashboard/channels`),
    );
  }

  const { clientId, redirectUri } = getYouTubeEnv();
  const state = randomBytes(32).toString("hex");

  const authorizeUrl = new URL(GOOGLE_AUTH_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  authorizeUrl.searchParams.set("state", state);
  // access_type=offline + prompt=consent guarantees Google issues a
  // refresh_token, even on re-consent. Without these, refresh_token is
  // missing on the second OAuth round-trip and the channel becomes
  // unrefreshable.
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("include_granted_scopes", "true");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/api/oauth/youtube",
  });
  return response;
}

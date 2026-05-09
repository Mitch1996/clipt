import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  FB_AUTH_URL,
  INSTAGRAM_SCOPES,
  getInstagramEnv,
} from "@/features/channels/server/instagram";

const STATE_COOKIE = "clipt_instagram_oauth_state";
const STATE_TTL_SECONDS = 600;

export async function GET() {
  const env = getInstagramEnv();
  if (!env) {
    return NextResponse.redirect(
      new URL(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/channels?instagram=not_configured`,
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`${process.env.NEXT_PUBLIC_APP_URL}/auth/login?next=/dashboard/channels`),
    );
  }

  const state = randomBytes(32).toString("hex");
  const authorizeUrl = new URL(FB_AUTH_URL);
  authorizeUrl.searchParams.set("client_id", env.clientId);
  authorizeUrl.searchParams.set("redirect_uri", env.redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  authorizeUrl.searchParams.set("state", state);
  // Force re-auth so the user can pick a different IG account on
  // reconnect (Meta caches consents very aggressively otherwise).
  authorizeUrl.searchParams.set("auth_type", "reauthenticate");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/api/oauth/instagram",
  });
  return response;
}

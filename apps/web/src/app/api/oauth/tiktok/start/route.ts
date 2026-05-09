import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  TIKTOK_AUTH_URL,
  TIKTOK_SCOPES,
  getTikTokEnv,
} from "@/features/channels/server/tiktok";

const STATE_COOKIE = "clipt_tiktok_oauth_state";
const STATE_TTL_SECONDS = 600;

export async function GET() {
  const env = getTikTokEnv();
  if (!env) {
    // Fall through to the channels page with a friendly toast — TikTok
    // creds aren't configured yet.
    return NextResponse.redirect(
      new URL(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/channels?tiktok=not_configured`,
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
  const authorizeUrl = new URL(TIKTOK_AUTH_URL);
  authorizeUrl.searchParams.set("client_key", env.clientKey);
  authorizeUrl.searchParams.set("redirect_uri", env.redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/api/oauth/tiktok",
  });
  return response;
}

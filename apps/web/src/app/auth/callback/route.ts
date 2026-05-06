import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth + email-confirm landing point.
 *
 * Supabase redirects here with one of two query patterns:
 *   - ?code=...                   PKCE / email confirm flow
 *   - #access_token=...&...       (legacy hash flow — handled client-side
 *                                  by the SDK; for our setup we always use
 *                                  the PKCE/code flow above)
 *
 * On success we redirect to ?next=... if it's a same-origin path,
 * otherwise to /dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/dashboard";

  // Only allow same-origin relative redirects to avoid open-redirect
  // surface area.
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.warn("auth/callback exchange failed:", error.message);
  }

  // If we get here, something went wrong — bounce to login with a hint.
  const loginUrl = new URL("/auth/login", origin);
  loginUrl.searchParams.set("error", "callback_failed");
  return NextResponse.redirect(loginUrl);
}

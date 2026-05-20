import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session cookie on every matched request and
 * enforces the auth-redirect contract:
 *   - Unauthed user hitting /dashboard/*  -> redirect to /auth/login
 *   - Authed user hitting /auth/*         -> redirect to /dashboard
 *     (except /auth/callback, which always passes through so the OAuth
 *     code-exchange can run before the session cookie exists)
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Fail-open if Supabase isn't configured for this deployment (e.g. a
  // preview / landing-only build): skip the auth probe and treat the
  // user as anonymous. The matcher still passes `/` through and the
  // dashboard guards below redirect to /auth/login on anonymous hits.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return passthroughOrGuard(request, response, null);
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() (not getSession()) — getSession reads from the
  // cookie without verifying with the auth server, which is unsafe in
  // middleware where we make trust decisions.
  //
  // If the auth call throws (Supabase paused, network blip, DNS) we
  // fail-open as anonymous so a transient outage doesn't 500 the whole
  // site. The dashboard guards still redirect to /auth/login.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch {
    user = null;
  }

  return passthroughOrGuard(request, response, user);
}

function passthroughOrGuard(
  request: NextRequest,
  response: NextResponse,
  user: { id: string } | null,
): NextResponse {
  const { pathname } = request.nextUrl;

  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/auth") && pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, and anything with a file extension.
    // The negative lookahead matches "any path that doesn't end in .ext".
    "/((?!_next/static|_next/image|favicon.svg|favicon.ico|logo.svg|logo-dark.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};

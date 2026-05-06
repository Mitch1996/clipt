/**
 * ⚠️  SERVER-ONLY. NEVER IMPORT THIS FROM CLIENT CODE.
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY, which bypasses Row Level Security.
 * Only safe inside route handlers, server actions, Inngest functions,
 * and other server-only modules. Importing this from a "use client" file
 * (or any module that ends up in the client bundle) leaks the service
 * role to the browser.
 */
import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client for the mobile app.
 *
 * Two RN-specific quirks vs the web client (apps/web/src/lib/supabase):
 *
 * 1. Storage adapter is AsyncStorage, not the browser's localStorage
 *    (or the SSR cookies the web app uses). Without this the session
 *    won't persist across app restarts.
 *
 * 2. detectSessionInUrl MUST be false on React Native. The web
 *    default tries to read the OAuth fragment from window.location,
 *    which doesn't exist; we handle the deep-link OAuth flow
 *    manually via Linking + supabase.auth.exchangeCodeForSession in
 *    src/features/auth.
 *
 * Env vars come from app.config.ts / .env.local (EXPO_PUBLIC_*).
 * Expo inlines these at build time so they're available at runtime
 * via process.env.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud failure during development so a missing .env.local doesn't
  // silently produce a half-broken auth flow.
  // eslint-disable-next-line no-console
  console.warn(
    "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing — auth will not work. Copy .env.example to .env.local and fill in values.",
  );
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

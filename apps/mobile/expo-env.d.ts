/// <reference types="expo/types" />

// Expo inlines anything prefixed with EXPO_PUBLIC_* at build time
// (Expo SDK 50+). We declare them here so TypeScript stops asking
// for @types/node — process.env is the only thing we need from
// Node's globals on the client.

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_APP_URL?: string;
  }
}

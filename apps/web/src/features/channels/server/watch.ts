"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin-only "watch-only" channel onboarding.
 *
 * Insert a `channels` row for a Twitch streamer we don't have OAuth
 * for. The live worker's scheduler reads channels where
 * `access_token_encrypted IS NOT NULL`, so we stamp a sentinel value;
 * no code in the worker ever decrypts watch-only tokens (the /helix
 * stream-status check uses an app-access token, not the user's).
 *
 * Use case: pitching a streamer cold. We watch their channel ourselves
 * for a day or two, the chat/audio detectors auto-clip their hype
 * moments, we DM them a private preview link showing their own
 * automatically-generated vertical clips. When they sign up + connect
 * their own channel, ownership of the row transfers to them.
 *
 * Caller must be a profile with role='admin' (existing RLS gate +
 * public.is_admin helper). Anyone else gets 403'd.
 */

const TWITCH_HELIX_USERS = "https://api.twitch.tv/helix/users";
const TWITCH_OAUTH_TOKEN = "https://id.twitch.tv/oauth2/token";

let _appToken: { token: string; expiresAt: number } | null = null;

async function twitchAppToken(): Promise<string> {
  const now = Date.now();
  if (_appToken && _appToken.expiresAt - 300_000 > now) return _appToken.token;
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set");
  }
  const res = await fetch(TWITCH_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Twitch app-token failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  _appToken = {
    token: body.access_token,
    expiresAt: now + body.expires_in * 1000,
  };
  return body.access_token;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
}

async function resolveTwitchUser(login: string): Promise<TwitchUser | null> {
  const token = await twitchAppToken();
  const id = process.env.TWITCH_CLIENT_ID!;
  const url = `${TWITCH_HELIX_USERS}?login=${encodeURIComponent(login)}`;
  const res = await fetch(url, {
    headers: { "Client-Id": id, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Twitch /helix/users: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data: TwitchUser[] };
  return body.data[0] ?? null;
}

const TWITCH_HELIX_STREAMS = "https://api.twitch.tv/helix/streams";

async function fetchTwitchLiveStatus(userId: string): Promise<boolean> {
  const token = await twitchAppToken();
  const id = process.env.TWITCH_CLIENT_ID!;
  const url = `${TWITCH_HELIX_STREAMS}?user_id=${encodeURIComponent(userId)}`;
  try {
    const res = await fetch(url, {
      headers: { "Client-Id": id, Authorization: `Bearer ${token}` },
      // Don't trust Next's default fetch cache — we want a live read.
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { data: unknown[] };
    return (body.data ?? []).length > 0;
  } catch {
    return false;
  }
}

export type AddWatchChannelResult =
  | { ok: true; channelId: string; platformUserId: string; platformLogin: string }
  | { ok: false; error: string };

export async function addWatchOnlyChannel(
  rawLogin: string,
): Promise<AddWatchChannelResult> {
  const login = rawLogin.trim().toLowerCase().replace(/^@+/, "");
  if (!login || !/^[a-z0-9_]{3,25}$/.test(login)) {
    return { ok: false, error: "Login must be 3–25 chars, letters/numbers/underscore." };
  }

  // Admin gate via the user's session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false, error: "Admins only" };
  }

  let twitchUser: TwitchUser | null;
  try {
    twitchUser = await resolveTwitchUser(login);
  } catch (exc) {
    return { ok: false, error: (exc as Error).message };
  }
  if (!twitchUser) {
    return { ok: false, error: `Twitch user @${login} not found` };
  }

  // Upsert by (platform, platform_user_id). If they're already a real
  // connected channel (has a non-WATCH_ONLY token) we don't touch them.
  const { data: existing } = await admin
    .from("channels")
    .select("id, access_token_encrypted")
    .eq("platform", "twitch")
    .eq("platform_user_id", twitchUser.id)
    .maybeSingle();

  if (existing && existing.access_token_encrypted !== "WATCH_ONLY") {
    return {
      ok: false,
      error: "Channel already connected with real OAuth — won't overwrite.",
    };
  }

  if (existing) {
    // Already a watch-only row — idempotent no-op.
    return {
      ok: true,
      channelId: existing.id,
      platformUserId: twitchUser.id,
      platformLogin: twitchUser.login,
    };
  }

  // One-shot live-status check so the UI doesn't show a "Offline" badge
  // for 30s after add (the scheduler tick interval) when the streamer
  // is in fact live. Best-effort; on failure the worker scheduler
  // catches up shortly anyway.
  const isLiveNow = await fetchTwitchLiveStatus(twitchUser.id);
  const nowIso = new Date().toISOString();

  const { data: inserted, error } = await admin
    .from("channels")
    .insert({
      owner_id: user.id, // admin owns the row; transfer on real signup
      platform: "twitch",
      platform_user_id: twitchUser.id,
      platform_username: twitchUser.login,
      // Sentinel: any non-null value makes the scheduler pick the row
      // up. We deliberately don't store an encrypted blob because we
      // don't have an OAuth grant from the streamer yet.
      access_token_encrypted: "WATCH_ONLY",
      scopes: [],
      is_live: isLiveNow,
      last_live_check: nowIso,
      last_live_at: isLiveNow ? nowIso : null,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Insert failed" };
  }

  return {
    ok: true,
    channelId: inserted.id,
    platformUserId: twitchUser.id,
    platformLogin: twitchUser.login,
  };
}

export interface WatchOnlyChannel {
  id: string;
  platform_username: string | null;
  is_live: boolean;
  last_live_check: string | null;
  last_live_at: string | null;
  face_cam_corner: string | null;
  clipCount: number;
}

export async function listWatchOnlyChannels(): Promise<WatchOnlyChannel[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return [];

  const { data: rows } = await admin
    .from("channels")
    .select(
      "id, platform_username, is_live, last_live_check, last_live_at, face_cam_corner",
    )
    .eq("platform", "twitch")
    .eq("access_token_encrypted", "WATCH_ONLY")
    .order("last_live_at", { ascending: false, nullsFirst: false });
  if (!rows) return [];

  const out: WatchOnlyChannel[] = [];
  for (const row of rows) {
    const { count } = await admin
      .from("clips")
      .select("id", { head: true, count: "exact" })
      .eq("source_channel_id", row.id)
      .is("deleted_at", null);
    out.push({ ...row, clipCount: count ?? 0 });
  }
  return out;
}

export async function removeWatchOnlyChannel(
  channelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only" };
  const { error } = await admin
    .from("channels")
    .delete()
    .eq("id", channelId)
    .eq("access_token_encrypted", "WATCH_ONLY"); // never delete real OAuth rows
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

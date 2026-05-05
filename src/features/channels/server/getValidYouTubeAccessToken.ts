import "server-only";

import { decrypt, encrypt } from "@/lib/crypto/encryption";
import { createClient } from "@/lib/supabase/server";

import { refreshYouTubeTokens } from "./youtube";

export class YouTubeTokenRevokedError extends Error {
  constructor(message = "YouTube refresh failed; user has likely revoked the app.") {
    super(message);
    this.name = "YouTubeTokenRevokedError";
  }
}

const REFRESH_LEEWAY_MS = 60_000;

export interface ValidYouTubeAccessToken {
  accessToken: string;
  expiresAt: Date;
  refreshed: boolean;
}

/**
 * Same shape as getValidTwitchAccessToken: returns a non-expired access
 * token, refreshing 60s before expiry. The Google twist: the refresh
 * response usually omits a fresh refresh_token, so we KEEP the existing
 * one when that field is missing.
 */
export async function getValidYouTubeAccessToken(
  channelId: string,
): Promise<ValidYouTubeAccessToken> {
  const supabase = await createClient();

  const { data: channel, error } = await supabase
    .from("channels")
    .select("id, owner_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", channelId)
    .eq("platform", "youtube")
    .single();
  if (error || !channel) {
    throw new Error(`channel ${channelId} not found or not accessible`);
  }
  if (!channel.refresh_token_encrypted) {
    throw new YouTubeTokenRevokedError("channel has no refresh token (disconnected)");
  }

  const now = Date.now();
  const expiresAt = channel.token_expires_at ? new Date(channel.token_expires_at) : null;
  const stillValid =
    !!channel.access_token_encrypted &&
    expiresAt !== null &&
    expiresAt.getTime() - now > REFRESH_LEEWAY_MS;

  if (stillValid) {
    return {
      accessToken: decrypt(channel.access_token_encrypted!),
      expiresAt: expiresAt!,
      refreshed: false,
    };
  }

  const refreshTokenPlain = decrypt(channel.refresh_token_encrypted);
  let fresh;
  try {
    fresh = await refreshYouTubeTokens(refreshTokenPlain);
  } catch (err) {
    await supabase
      .from("channels")
      .update({
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", channel.id);
    throw new YouTubeTokenRevokedError(
      err instanceof Error ? err.message : String(err),
    );
  }

  const newExpiresAt = new Date(now + fresh.expires_in * 1000);
  // Google may or may not return a new refresh_token. Reuse the old one if
  // the response omits it.
  const newRefreshToken = fresh.refresh_token ?? refreshTokenPlain;

  const { error: updateErr } = await supabase
    .from("channels")
    .update({
      access_token_encrypted: encrypt(fresh.access_token),
      refresh_token_encrypted: encrypt(newRefreshToken),
      token_expires_at: newExpiresAt.toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", channel.id);
  if (updateErr) {
    console.warn("youtube refresh persisted-update failed:", updateErr);
  }

  return { accessToken: fresh.access_token, expiresAt: newExpiresAt, refreshed: true };
}

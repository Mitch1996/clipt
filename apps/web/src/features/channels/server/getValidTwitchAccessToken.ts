import "server-only";

import { decrypt, encrypt } from "@/lib/crypto/encryption";
import { createClient } from "@/lib/supabase/server";

import { refreshTwitchTokens } from "./twitch";

export class TwitchTokenRevokedError extends Error {
  constructor(message = "Twitch refresh failed; user has likely revoked the app.") {
    super(message);
    this.name = "TwitchTokenRevokedError";
  }
}

const REFRESH_LEEWAY_MS = 60_000; // refresh if the token expires within this window

export interface ValidTwitchAccessToken {
  accessToken: string;
  expiresAt: Date;
  /**
   * True if we just minted a new token via refresh. Useful in tests + logs;
   * normal callers can ignore.
   */
  refreshed: boolean;
}

/**
 * Return a non-expired Twitch access token for the given channel id.
 * If the cached token is within REFRESH_LEEWAY_MS of expiry, swap it for
 * a fresh one via the refresh-token grant and persist the new pair.
 *
 * Throws TwitchTokenRevokedError if the refresh-token grant fails (the
 * standard signal that the user revoked the app).
 *
 * Authorization: relies on the caller's Supabase session — RLS allows the
 * owner to read/update their own channel rows. For background-job paths
 * without a user session, swap the SSR client for the admin client.
 */
export async function getValidTwitchAccessToken(
  channelId: string,
): Promise<ValidTwitchAccessToken> {
  const supabase = await createClient();

  const { data: channel, error } = await supabase
    .from("channels")
    .select("id, owner_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", channelId)
    .eq("platform", "twitch")
    .single();
  if (error || !channel) {
    throw new Error(`channel ${channelId} not found or not accessible`);
  }
  if (!channel.refresh_token_encrypted) {
    throw new TwitchTokenRevokedError("channel has no refresh token (disconnected)");
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

  // Refresh.
  const refreshToken = decrypt(channel.refresh_token_encrypted);
  let fresh;
  try {
    fresh = await refreshTwitchTokens(refreshToken);
  } catch (err) {
    // Twitch returns 400 on revoked refresh tokens. Wipe the row's tokens
    // so future calls fail fast with a clear error; the user has to
    // re-OAuth from the dashboard.
    await supabase
      .from("channels")
      .update({
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", channel.id);
    throw new TwitchTokenRevokedError(
      err instanceof Error ? err.message : String(err),
    );
  }

  const newExpiresAt = new Date(now + fresh.expires_in * 1000);
  const { error: updateErr } = await supabase
    .from("channels")
    .update({
      access_token_encrypted: encrypt(fresh.access_token),
      refresh_token_encrypted: encrypt(fresh.refresh_token),
      token_expires_at: newExpiresAt.toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", channel.id);
  if (updateErr) {
    // The refresh succeeded but we couldn't persist the new pair. Surface
    // the in-memory token so the immediate caller can proceed; the next
    // call will refresh again.
    console.warn("twitch refresh persisted-update failed:", updateErr);
  }

  return { accessToken: fresh.access_token, expiresAt: newExpiresAt, refreshed: true };
}

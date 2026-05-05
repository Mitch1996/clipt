import "server-only";

export const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
export const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
export const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";

/**
 * Scopes we request when connecting a Twitch channel. Stored in
 * `channels.scopes[]` per row. Matches Prompt 1.2 contract:
 *   - user:read:email             — basic identity, including email
 *   - clips:edit                  — used in Phase 1 to pull source clips
 *   - channel:read:subscriptions  — used in Phase 3 (revenue share)
 */
export const TWITCH_SCOPES = [
  "user:read:email",
  "clips:edit",
  "channel:read:subscriptions",
] as const;

export const TWITCH_REDIRECT_PATH = "/api/oauth/twitch/callback";

export interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: "bearer";
}

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  email?: string;
  profile_image_url?: string;
}

export function getTwitchEnv() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error(
      "Twitch OAuth not configured: set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, NEXT_PUBLIC_APP_URL.",
    );
  }
  return { clientId, clientSecret, redirectUri: `${appUrl}${TWITCH_REDIRECT_PATH}` };
}

/** Exchange an authorization code for an access + refresh token pair. */
export async function exchangeCodeForTokens(code: string): Promise<TwitchTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getTwitchEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`twitch code exchange failed: ${res.status} ${body}`);
  }
  return res.json();
}

/** Use a refresh token to get a fresh access token. */
export async function refreshTwitchTokens(
  refreshToken: string,
): Promise<TwitchTokenResponse> {
  const { clientId, clientSecret } = getTwitchEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`twitch refresh failed: ${res.status} ${body}`);
  }
  return res.json();
}

/** Fetch the authenticated user's Twitch profile. */
export async function fetchTwitchUser(accessToken: string): Promise<TwitchUser> {
  const { clientId } = getTwitchEnv();
  const res = await fetch(TWITCH_USERS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`twitch /helix/users failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { data: TwitchUser[] };
  if (!json.data?.[0]) throw new Error("twitch /helix/users returned no user");
  return json.data[0];
}

import "server-only";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

/**
 * Scopes we request when connecting a YouTube channel:
 *   - youtube.readonly  — list channel + video metadata in Phase 1
 *   - youtube.upload    — post Shorts back to the channel in Prompt 1.14
 *
 * These are listed on the Google Cloud OAuth consent screen as well so the
 * user sees the same set during the authorization step.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
] as const;

export const YOUTUBE_REDIRECT_PATH = "/api/oauth/youtube/callback";

export interface YouTubeTokenResponse {
  access_token: string;
  refresh_token?: string; // only returned on first consent OR with prompt=consent
  expires_in: number;
  scope: string;
  token_type: "Bearer";
  id_token?: string;
}

export interface YouTubeChannel {
  id: string;
  snippet: {
    title: string;
    customUrl?: string;
    thumbnails?: { default?: { url?: string } };
  };
}

export function getYouTubeEnv() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error(
      "YouTube OAuth not configured: set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL.",
    );
  }
  return { clientId, clientSecret, redirectUri: `${appUrl}${YOUTUBE_REDIRECT_PATH}` };
}

/** Exchange an authorization code for an access + refresh token pair. */
export async function exchangeCodeForTokens(code: string): Promise<YouTubeTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getYouTubeEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`google code exchange failed: ${res.status} ${body}`);
  }
  return res.json();
}

/**
 * Refresh an access token. Note: Google's refresh response does NOT include
 * a new refresh_token — the original keeps working until it's revoked.
 * Callers should keep the existing refresh_token if the response omits one.
 */
export async function refreshYouTubeTokens(
  refreshToken: string,
): Promise<YouTubeTokenResponse> {
  const { clientId, clientSecret } = getYouTubeEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`google refresh failed: ${res.status} ${body}`);
  }
  return res.json();
}

/**
 * Fetch the authenticated user's primary YouTube channel. We use
 * `mine=true` which returns the channel owned by the authorized account.
 */
export async function fetchYouTubeChannel(accessToken: string): Promise<YouTubeChannel> {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`youtube /channels failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { items?: YouTubeChannel[] };
  if (!json.items?.[0]) {
    throw new Error("authorized Google account has no YouTube channel");
  }
  return json.items[0];
}

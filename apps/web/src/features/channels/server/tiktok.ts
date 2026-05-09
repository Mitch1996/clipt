import "server-only";

export const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
export const TIKTOK_VIDEO_PUBLISH_INIT_URL =
  "https://open.tiktokapis.com/v2/post/publish/video/init/";
export const TIKTOK_VIDEO_PUBLISH_STATUS_URL =
  "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

/**
 * Scopes for the Content Posting API. `video.publish` requires app
 * audit before production; sandbox accounts can post without it.
 */
export const TIKTOK_SCOPES = [
  "user.info.basic",
  "video.publish",
  "video.list",
] as const;

export const TIKTOK_REDIRECT_PATH = "/api/oauth/tiktok/callback";

export interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: "Bearer";
}

export interface TikTokUser {
  open_id: string;
  union_id?: string;
  display_name: string;
  username?: string;
  avatar_url?: string;
}

export function getTikTokEnv(): {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientKey || !clientSecret || !appUrl) return null;
  return { clientKey, clientSecret, redirectUri: `${appUrl}${TIKTOK_REDIRECT_PATH}` };
}

export function isTikTokConfigured(): boolean {
  return getTikTokEnv() !== null;
}

export async function exchangeCodeForTokens(code: string): Promise<TikTokTokenResponse> {
  const env = getTikTokEnv();
  if (!env) throw new Error("TikTok OAuth not configured");
  const params = new URLSearchParams({
    client_key: env.clientKey,
    client_secret: env.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: env.redirectUri,
  });
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`tiktok code exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function refreshTikTokTokens(refreshToken: string): Promise<TikTokTokenResponse> {
  const env = getTikTokEnv();
  if (!env) throw new Error("TikTok OAuth not configured");
  const params = new URLSearchParams({
    client_key: env.clientKey,
    client_secret: env.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`tiktok refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function fetchTikTokUser(accessToken: string): Promise<TikTokUser> {
  const url = new URL(TIKTOK_USER_INFO_URL);
  url.searchParams.set(
    "fields",
    "open_id,union_id,avatar_url,display_name,username",
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`tiktok user_info failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: { user?: TikTokUser }; error?: unknown };
  if (!json.data?.user) {
    throw new Error("tiktok user_info: empty response");
  }
  return json.data.user;
}

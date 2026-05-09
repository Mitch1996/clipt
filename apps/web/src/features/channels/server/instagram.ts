import "server-only";

/**
 * Instagram = Meta. The "Instagram Login" via Facebook OAuth landing page,
 * tokens via the Graph API. Posting Reels requires:
 *   1. The user has an **Instagram Business or Creator account**
 *   2. That account is linked to a Facebook Page
 *   3. The Meta app has `instagram_content_publish` permission (gated
 *      behind Meta's app review)
 *
 * Locally without that review, this whole flow is "Coming soon" — we
 * still wire the OAuth code so the channels page can light up the
 * Connect Instagram button as soon as creds are pasted.
 */

export const FB_AUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth";
export const FB_TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token";
export const FB_DEBUG_TOKEN_URL =
  "https://graph.facebook.com/v21.0/debug_token";

/** "instagram_basic" + publish — bare minimum to upload Reels. */
export const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
] as const;

export const INSTAGRAM_REDIRECT_PATH = "/api/oauth/instagram/callback";

export interface InstagramTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in?: number; // long-lived tokens are 60 days
}

export interface InstagramUser {
  id: string;
  username: string;
  account_type?: string;
}

export function getInstagramEnv(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl}${INSTAGRAM_REDIRECT_PATH}` };
}

export function isInstagramConfigured(): boolean {
  return getInstagramEnv() !== null;
}

export async function exchangeCodeForToken(code: string): Promise<InstagramTokenResponse> {
  const env = getInstagramEnv();
  if (!env) throw new Error("Instagram OAuth not configured");
  const url = new URL(FB_TOKEN_URL);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("client_secret", env.clientSecret);
  url.searchParams.set("code", code);
  url.searchParams.set("redirect_uri", env.redirectUri);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fb code exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Exchange the short-lived token for the 60-day long-lived one. */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<InstagramTokenResponse> {
  const env = getInstagramEnv();
  if (!env) throw new Error("Instagram OAuth not configured");
  const url = new URL(FB_TOKEN_URL);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("client_secret", env.clientSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `fb long-lived exchange failed: ${res.status} ${await res.text()}`,
    );
  }
  return res.json();
}

export async function fetchInstagramAccount(
  accessToken: string,
): Promise<InstagramUser> {
  // 1. Get pages the user manages.
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`,
  );
  if (!pagesRes.ok) {
    throw new Error(`fb /me/accounts failed: ${pagesRes.status}`);
  }
  const pages = (await pagesRes.json()) as {
    data?: Array<{ id: string; access_token: string; name: string }>;
  };
  const page = pages.data?.[0];
  if (!page) throw new Error("Connect a Facebook Page that owns an IG Business account first");

  // 2. Resolve the linked Instagram Business account.
  const igRes = await fetch(
    `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
  );
  if (!igRes.ok) {
    throw new Error(`fb page lookup failed: ${igRes.status}`);
  }
  const igPage = (await igRes.json()) as {
    instagram_business_account?: { id: string };
  };
  if (!igPage.instagram_business_account) {
    throw new Error("This Facebook Page isn't linked to an Instagram Business account");
  }

  // 3. Fetch the IG account's basic profile.
  const igAccRes = await fetch(
    `https://graph.facebook.com/v21.0/${igPage.instagram_business_account.id}?fields=id,username,account_type&access_token=${page.access_token}`,
  );
  if (!igAccRes.ok) {
    throw new Error(`ig account lookup failed: ${igAccRes.status}`);
  }
  return (await igAccRes.json()) as InstagramUser;
}

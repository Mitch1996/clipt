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

// ─────────────────────────────────────────────────────────────
// Clip metadata via Twitch GraphQL
//
// Twitch's official Helix /clips endpoint returns metadata but NOT a
// downloadable mp4 URL. The legacy "swap -preview-WxH.jpg for .mp4"
// trick on the thumbnail stopped working when Twitch moved clips
// onto their new jtvnw.net CDN, so we use the same GraphQL endpoint
// the website's player uses, which returns `videoQualities[].sourceURL`
// plus a `playbackAccessToken` that has to be appended for the CDN to
// serve the bytes.
//
// We hit gql.twitch.tv/gql with the publicly-known web Client-ID
// (`kimne78kx3ncx6brgo4mv6wki5h1ko`). This is the documented pattern
// every Twitch clip downloader uses; it's not a sanctioned partner
// API, so flag if/when Twitch breaks it.
// ─────────────────────────────────────────────────────────────

const TWITCH_GQL_URL = "https://gql.twitch.tv/gql";
const TWITCH_GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

export interface TwitchClipMeta {
  id: string;
  /** Slug we queried with (Twitch's stable handle for the clip). */
  slug: string;
  title: string;
  broadcasterId: string;
  broadcasterName: string;
  broadcasterLogin: string;
  durationSeconds: number;
  thumbnailUrl: string;
  /** Direct mp4 URL with playback-access-token already appended. */
  mp4Url: string;
  viewCount: number;
}

interface GqlClipResponse {
  data?: {
    clip: {
      id: string;
      slug: string;
      title: string;
      durationSeconds: number;
      viewCount: number;
      thumbnailURL: string;
      broadcaster: {
        id: string;
        login: string;
        displayName: string;
      } | null;
      videoQualities: Array<{
        frameRate: number;
        quality: string;
        sourceURL: string;
      }>;
      playbackAccessToken: {
        signature: string;
        value: string;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

const CLIP_QUERY = `
query CliptClipMeta($slug: ID!) {
  clip(slug: $slug) {
    id
    slug
    title
    durationSeconds
    viewCount
    thumbnailURL(width: 480, height: 272)
    broadcaster {
      id
      login
      displayName
    }
    videoQualities {
      frameRate
      quality
      sourceURL
    }
    playbackAccessToken(params: { platform: "web", playerType: "site" }) {
      signature
      value
    }
  }
}`;

export async function fetchTwitchClipMeta(slug: string): Promise<TwitchClipMeta | null> {
  const res = await fetch(TWITCH_GQL_URL, {
    method: "POST",
    headers: {
      "Client-Id": TWITCH_GQL_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: CLIP_QUERY, variables: { slug } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`twitch gql failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as GqlClipResponse;
  if (json.errors?.length) {
    throw new Error(
      `twitch gql errors: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }

  const clip = json.data?.clip;
  if (!clip || !clip.broadcaster) return null;

  if (!clip.videoQualities?.length) {
    throw new Error("twitch gql returned no videoQualities (clip private or unavailable)");
  }

  // Pick highest resolution. Quality strings are "1080" / "720" / "480"…
  const sorted = [...clip.videoQualities].sort(
    (a, b) => Number(b.quality) - Number(a.quality),
  );
  const best = sorted[0];

  // The CDN refuses to serve without the access token query params.
  const mp4Url = clip.playbackAccessToken
    ? `${best.sourceURL}?sig=${clip.playbackAccessToken.signature}&token=${encodeURIComponent(clip.playbackAccessToken.value)}`
    : best.sourceURL;

  return {
    id: clip.id,
    slug: clip.slug,
    title: clip.title,
    broadcasterId: clip.broadcaster.id,
    broadcasterName: clip.broadcaster.displayName,
    broadcasterLogin: clip.broadcaster.login,
    durationSeconds: clip.durationSeconds,
    thumbnailUrl: clip.thumbnailURL,
    mp4Url,
    viewCount: clip.viewCount,
  };
}

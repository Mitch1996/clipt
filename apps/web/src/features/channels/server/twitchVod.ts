import "server-only";

/**
 * Resolve a Twitch streamer's latest VOD HLS URL.
 *
 * Used by the `channel/added` Inngest function to pre-detect a
 * channel's face-cam corner the moment we know about the channel,
 * not when their first clip lands. Mirrors the live worker's
 * resolve_hls_playlist() pattern but for VODs:
 *   1. /helix/videos?user_id=X&first=1 — find the most recent VOD
 *   2. GraphQL PlaybackAccessToken_Template with isVod=true        — get token
 *   3. Build usher VOD m3u8 URL.
 *
 * The video worker ffmpegs frames from this URL and feeds them to
 * gpt-4o-mini; same logic as the per-clip vision fallback, just with
 * a real session's worth of varied gameplay to reason over.
 */

const TWITCH_HELIX_VIDEOS = "https://api.twitch.tv/helix/videos";
const TWITCH_OAUTH_TOKEN = "https://id.twitch.tv/oauth2/token";
const TWITCH_GQL_URL = "https://gql.twitch.tv/gql";
const TWITCH_GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

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

interface HelixVideo {
  id: string;
  user_id: string;
  user_login: string;
  title: string;
  /** ISO8601 duration string e.g. "3h47m12s". */
  duration: string;
  type: "archive" | "highlight" | "upload";
  view_count: number;
  published_at: string;
}

function parseTwitchDuration(s: string): number {
  let total = 0;
  const m = s.matchAll(/(\d+)([hms])/g);
  for (const part of m) {
    const v = Number(part[1]);
    const unit = part[2];
    if (unit === "h") total += v * 3600;
    else if (unit === "m") total += v * 60;
    else if (unit === "s") total += v;
  }
  return total;
}

/** Latest archive (full VOD) for the given Twitch user_id, or null if
 * the channel has no public VODs (sub-only / cleared archive / new
 * account that hasn't broadcast yet). */
async function latestArchiveVod(userId: string): Promise<HelixVideo | null> {
  const token = await twitchAppToken();
  const id = process.env.TWITCH_CLIENT_ID!;
  // Pull 5 and filter for `archive` — highlights and uploads tend to be
  // cherry-picked moments that don't represent the streamer's typical
  // layout (frequent cuts, alt cameras). Full archives are best.
  const url = `${TWITCH_HELIX_VIDEOS}?user_id=${encodeURIComponent(userId)}&first=5&type=all`;
  const res = await fetch(url, {
    headers: { "Client-Id": id, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Twitch /helix/videos: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data: HelixVideo[] };
  const archives = (body.data ?? []).filter((v) => v.type === "archive");
  if (archives.length) return archives[0];
  // Fall back to whatever's available; better some signal than none.
  return body.data?.[0] ?? null;
}

interface PlaybackAccessToken {
  value: string;
  signature: string;
}

async function videoPlaybackAccessToken(
  vodId: string,
): Promise<PlaybackAccessToken | null> {
  const query = {
    operationName: "PlaybackAccessToken_Template",
    query:
      "query PlaybackAccessToken_Template(" +
      "$login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {" +
      '  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {' +
      "    value signature __typename" +
      "  }" +
      '  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {' +
      "    value signature __typename" +
      "  }" +
      "}",
    variables: {
      login: "",
      isLive: false,
      vodID: vodId,
      isVod: true,
      playerType: "site",
    },
  };
  const res = await fetch(TWITCH_GQL_URL, {
    method: "POST",
    headers: {
      "Client-Id": TWITCH_GQL_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(query),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { videoPlaybackAccessToken?: PlaybackAccessToken | null };
  };
  return json.data?.videoPlaybackAccessToken ?? null;
}

export interface ResolvedTwitchVod {
  vodId: string;
  /** m3u8 master playlist URL — feed straight to ffmpeg's `-i`. */
  hlsUrl: string;
  durationSec: number;
  title: string;
}

/**
 * Resolve the latest VOD into a streamable m3u8 URL. Returns null
 * when the streamer has no public archive (sub-only or auto-purged
 * after 14 days for non-affiliates).
 */
export async function resolveLatestTwitchVod(
  userId: string,
): Promise<ResolvedTwitchVod | null> {
  const vod = await latestArchiveVod(userId);
  if (!vod) return null;
  const token = await videoPlaybackAccessToken(vod.id);
  if (!token) return null;
  const params = new URLSearchParams({
    sig: token.signature,
    token: token.value,
    allow_source: "true",
    allow_audio_only: "true",
    player: "twitchweb",
    type: "any",
  });
  const hlsUrl = `https://usher.ttvnw.net/vod/${encodeURIComponent(vod.id)}.m3u8?${params}`;
  return {
    vodId: vod.id,
    hlsUrl,
    durationSec: parseTwitchDuration(vod.duration),
    title: vod.title,
  };
}

"""Twitch live-stream helpers.

Two responsibilities:
  1. `is_live(login)` — ask /helix/streams whether the channel is
     currently live. Used by the scheduler.
  2. `resolve_hls_playlist(login)` — GraphQL → m3u8 URL for the
     ingestor.

Auth strategy:
  - /helix/streams uses an **app access token** (client_credentials).
    No user OAuth needed — we just want a public "is X live" check.
  - The HLS playlist resolution uses Twitch's public web Client-ID
    (`kimne78kx3ncx6brgo4mv6wki5h1ko`) the same way Prompt 1.7's clip
    downloader does. Twitch publishes this Client-ID as part of their
    web app; it's not a secret.

App-access tokens are cached in-process with a 30-day refresh window
(real lifetime is ~60 days). Single-machine deployment so process
memory is fine for the cache.
"""
from __future__ import annotations

import time
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from .config import settings

log = logging.getLogger(__name__)

# Public web Client-ID. Same value used by twitch.tv's frontend; not
# a secret, just an opaque app identifier for GraphQL.
_PUBLIC_GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"
_GQL_URL = "https://gql.twitch.tv/gql"
_HELIX_BASE = "https://api.twitch.tv/helix"
_OAUTH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"

_app_token: tuple[str, float] | None = None  # (token, expiry-epoch)


async def _app_access_token(client: httpx.AsyncClient) -> str:
    """Get or refresh a client-credentials token. Cached in-process."""
    global _app_token
    now = time.time()
    if _app_token and _app_token[1] - 300 > now:
        return _app_token[0]
    s = settings()
    res = await client.post(
        _OAUTH_TOKEN_URL,
        data={
            "client_id": s.twitch_client_id,
            "client_secret": s.twitch_client_secret,
            "grant_type": "client_credentials",
        },
        timeout=10.0,
    )
    res.raise_for_status()
    body = res.json()
    token = body["access_token"]
    expires_in = int(body.get("expires_in", 3600))
    _app_token = (token, now + expires_in)
    return token


@dataclass(frozen=True)
class StreamStatus:
    is_live: bool
    title: str | None = None
    game_name: str | None = None
    viewer_count: int | None = None


async def stream_status(
    login: str,
    client: httpx.AsyncClient,
) -> StreamStatus:
    """Hit /helix/streams?user_login=<login>. Returns is_live=True only
    when the API confirms a streaming session."""
    token = await _app_access_token(client)
    res = await client.get(
        f"{_HELIX_BASE}/streams",
        params={"user_login": login},
        headers={
            "Client-Id": settings().twitch_client_id,
            "Authorization": f"Bearer {token}",
        },
        timeout=10.0,
    )
    if res.status_code != 200:
        log.warning("twitch /helix/streams non-200 for %s: %s", login, res.status_code)
        return StreamStatus(is_live=False)
    data = res.json().get("data") or []
    if not data:
        return StreamStatus(is_live=False)
    s = data[0]
    return StreamStatus(
        is_live=True,
        title=s.get("title"),
        game_name=s.get("game_name"),
        viewer_count=s.get("viewer_count"),
    )


async def resolve_hls_playlist(
    login: str,
    client: httpx.AsyncClient,
) -> str | None:
    """Build the m3u8 URL for the given login's live stream.

    Mirrors the GraphQL `PlaybackAccessToken_Template` query that
    Twitch's web app uses. Returns None if the channel isn't live or
    we can't get a token.
    """
    query: dict[str, Any] = {
        "operationName": "PlaybackAccessToken_Template",
        "query": (
            "query PlaybackAccessToken_Template("
            "$login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {"
            "  streamPlaybackAccessToken(channelName: $login, params: {platform: \"web\", playerBackend: \"mediaplayer\", playerType: $playerType}) @include(if: $isLive) {"
            "    value signature __typename"
            "  }"
            "  videoPlaybackAccessToken(id: $vodID, params: {platform: \"web\", playerBackend: \"mediaplayer\", playerType: $playerType}) @include(if: $isVod) {"
            "    value signature __typename"
            "  }"
            "}"
        ),
        "variables": {
            "login": login,
            "isLive": True,
            "vodID": "",
            "isVod": False,
            "playerType": "site",
        },
    }
    res = await client.post(
        _GQL_URL,
        json=query,
        headers={"Client-Id": _PUBLIC_GQL_CLIENT_ID},
        timeout=10.0,
    )
    if res.status_code != 200:
        log.warning("twitch gql non-200 for %s: %s", login, res.status_code)
        return None
    data = res.json().get("data") or {}
    token_obj = data.get("streamPlaybackAccessToken")
    if not token_obj:
        return None
    value = token_obj.get("value")
    sig = token_obj.get("signature")
    if not value or not sig:
        return None
    # usher.ttvnw.net returns the master m3u8. httpx handles the
    # url-encoding of the token JSON automatically.
    params = httpx.QueryParams(
        {
            "sig": sig,
            "token": value,
            "allow_source": "true",
            "allow_audio_only": "true",
            "fast_bread": "true",
            "p": str(int(time.time()) % 1_000_000),
        }
    )
    return f"https://usher.ttvnw.net/api/channel/hls/{login}.m3u8?{params}"

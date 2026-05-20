"""Runtime configuration.

The live worker shares the storage + Supabase contract with the rest
of Clipt — same `STORAGE_*` env vars as the video worker, same
`SUPABASE_*` keys the Next app uses. Twitch creds are read at the
same time so the scheduler can call `/helix/streams`.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # --- Supabase (service role; bypasses RLS) ---
    supabase_url: str
    supabase_service_role_key: str

    # --- Storage (AWS S3 by default; STORAGE_ENDPOINT_URL set when
    #     pointing at an S3-compatible backend like R2) ---
    storage_endpoint_url: str | None
    storage_access_key_id: str
    storage_secret_access_key: str
    storage_bucket: str
    storage_region: str

    # --- Twitch (app-access token resolution; user OAuth not needed
    #     for /helix/streams stream-status checks) ---
    twitch_client_id: str
    twitch_client_secret: str

    # --- Upstash Redis REST ---
    upstash_redis_rest_url: str
    upstash_redis_rest_token: str

    # --- Scheduler tuning ---
    poll_interval_s: float = 30.0          # how often to re-scan channels
    rolling_buffer_s: float = 300.0        # 5 minutes — segments older than this get pruned
    playlist_poll_s: float = 2.0           # how often a per-channel ingestor refetches the HLS playlist
    ingest_idle_s: float = 30.0            # if the playlist returns no new segments for this long, stop the ingestor

    @classmethod
    def load(cls) -> "Settings":
        def required(key: str) -> str:
            v = os.environ.get(key)
            if not v:
                raise RuntimeError(f"{key} not set in env")
            return v

        endpoint = (
            os.environ.get("STORAGE_ENDPOINT_URL")
            or None
        )
        if not endpoint:
            endpoint = None  # explicit normalisation; see worker/video/app/config.py for why

        return cls(
            supabase_url=required("NEXT_PUBLIC_SUPABASE_URL"),
            supabase_service_role_key=required("SUPABASE_SERVICE_ROLE_KEY"),
            storage_endpoint_url=endpoint,
            storage_access_key_id=required("STORAGE_ACCESS_KEY_ID"),
            storage_secret_access_key=required("STORAGE_SECRET_ACCESS_KEY"),
            storage_bucket=os.environ.get("STORAGE_BUCKET", "clipt-media"),
            storage_region=os.environ.get("STORAGE_REGION", "eu-north-1"),
            twitch_client_id=required("TWITCH_CLIENT_ID"),
            twitch_client_secret=required("TWITCH_CLIENT_SECRET"),
            upstash_redis_rest_url=required("UPSTASH_REDIS_REST_URL"),
            upstash_redis_rest_token=required("UPSTASH_REDIS_REST_TOKEN"),
        )


_cached: Settings | None = None


def settings() -> Settings:
    global _cached
    if _cached is None:
        _cached = Settings.load()
    return _cached

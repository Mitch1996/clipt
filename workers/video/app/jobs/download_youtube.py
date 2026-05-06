"""POST /jobs/download-youtube — stub for Phase 2.

The Next side currently hard-rejects YouTube + Twitch VOD sources via
UnsupportedSourceError. When Phase 2 lifts the gate, this endpoint
shells out to yt-dlp (already installed in the Docker image) to pull
the source mp4 + width/height/duration and write it to
sources/{clipId}.mp4.

Today the stub writes a 1KB placeholder so the Inngest function can be
re-pointed at this endpoint without code changes when 2.0 lands.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from ..storage import put_bytes, storage_keys


class DownloadYouTubeIn(BaseModel):
    clip_id: str = Field(alias="clipId")
    source_url: str = Field(alias="sourceUrl")

    model_config = {"populate_by_name": True}


class DownloadYouTubeOut(BaseModel):
    source_r2_key: str = Field(alias="sourceR2Key")
    duration_seconds: int = Field(alias="durationSeconds", default=0)
    width: int = 0
    height: int = 0

    model_config = {"populate_by_name": True}


def run(payload: DownloadYouTubeIn) -> DownloadYouTubeOut:
    keys = storage_keys(payload.clip_id)
    put_bytes(keys["source_mp4"], bytes(1024), "video/mp4")
    return DownloadYouTubeOut(
        sourceR2Key=keys["source_mp4"],
        durationSeconds=0,
        width=0,
        height=0,
    )

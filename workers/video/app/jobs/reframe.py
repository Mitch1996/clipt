"""POST /jobs/reframe — stub for Prompt 1.10.

Real implementation lands in Prompt 1.10: 9:16 reframe with MediaPipe
face tracking, ffmpeg crop + scale, burn captions across the bottom
third, attribution badge top-right, h264 baseline 1080x1920 30fps,
generate thumbnail at 1.5s.

Today the stub writes a 1KB placeholder mp4 + a 1KB placeholder jpg
so the Inngest function can wire its persist-step end-to-end.
"""
from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from ..storage import put_bytes, storage_keys

log = logging.getLogger(__name__)


class ReframeIn(BaseModel):
    clip_id: str = Field(alias="clipId")
    source_r2_key: str = Field(alias="sourceR2Key")
    captions_r2_key: str | None = Field(default=None, alias="captionsR2Key")
    style: str = "default"
    # Phase 1.11 bakes the attribution JWT into mp4 metadata via
    # ffmpeg's -metadata flag. Accept it now; ignore in the stub.
    attribution_token: str | None = Field(default=None, alias="attributionToken")
    creator_handle: str | None = Field(default=None, alias="creatorHandle")

    model_config = {"populate_by_name": True}


class ReframeOut(BaseModel):
    vertical_r2_key: str = Field(alias="verticalR2Key")
    thumbnail_r2_key: str = Field(alias="thumbnailR2Key")
    width: int = 1080
    height: int = 1920

    model_config = {"populate_by_name": True}


def run(payload: ReframeIn) -> ReframeOut:
    keys = storage_keys(payload.clip_id)
    placeholder = bytes(1024)
    # Best-effort. Real reframe (Prompt 1.10) will fail hard if storage
    # creds are missing.
    try:
        put_bytes(keys["vertical_mp4"], placeholder, "video/mp4")
        put_bytes(keys["thumbnail_jpg"], placeholder, "image/jpeg")
    except Exception as exc:  # noqa: BLE001
        log.warning("reframe stub: skipping storage write — %s", exc)
    return ReframeOut(
        verticalR2Key=keys["vertical_mp4"],
        thumbnailR2Key=keys["thumbnail_jpg"],
    )

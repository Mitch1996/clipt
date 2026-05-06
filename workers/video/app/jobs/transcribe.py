"""POST /jobs/transcribe — stub for Prompt 1.9.

Real implementation lands in Prompt 1.9: download the source mp4 from
storage, extract audio with ffmpeg, run faster-whisper transcribe with
word_timestamps=True, return + persist the captions JSON.

Today we just write a skeleton captions file so the calling Inngest
function can wire its persist-step end-to-end.
"""
from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from ..storage import put_json, storage_keys

log = logging.getLogger(__name__)


class TranscribeIn(BaseModel):
    clip_id: str = Field(alias="clipId")
    source_r2_key: str = Field(alias="sourceR2Key")

    model_config = {"populate_by_name": True}


class TranscribeOut(BaseModel):
    captions_r2_key: str = Field(alias="captionsR2Key")
    language: str = "en"
    word_count: int = Field(alias="wordCount", default=0)
    captions_json: dict = Field(alias="captionsJson")

    model_config = {"populate_by_name": True}


def run(payload: TranscribeIn) -> TranscribeOut:
    keys = storage_keys(payload.clip_id)
    captions = {
        "language": "en",
        "stub": True,
        "segments": [],
    }
    # Best-effort persistence — the stub doesn't need it to return a
    # response. Real Whisper impl (Prompt 1.9) will require storage
    # creds and surface failures hard.
    try:
        put_json(keys["captions_json"], captions)
    except Exception as exc:  # noqa: BLE001
        log.warning("transcribe stub: skipping storage write — %s", exc)
    return TranscribeOut(
        captionsR2Key=keys["captions_json"],
        language="en",
        wordCount=0,
        captionsJson=captions,
    )

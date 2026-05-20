"""POST /jobs/transcribe — real Whisper captions via OpenAI.

Pipeline:
  1. Download the source mp4 from storage to /tmp/{clipId}.mp4
  2. Extract mono 16 kHz audio with ffmpeg -> /tmp/{clipId}.mp3 (mp3 keeps
     payload small; OpenAI's audio endpoint caps requests at 25 MB)
  3. POST to OpenAI's audio.transcriptions.create with
     response_format=verbose_json + timestamp_granularities=["word","segment"]
  4. Re-shape into our CaptionsJson contract:
        { language: str, segments: [{ id, start, end, text, words: [...] }] }
  5. Write to captions/{clipId}.json on Supabase Storage
  6. Return TranscribeOut so the Inngest step can persist the JSON onto
     the clip row

Failure modes the worker rescues:
  - **Silent clip**: OpenAI still returns text="", words=[]. We persist
    an empty-segments JSON so the editor can show "No captions in this
    clip" rather than 500ing.
  - **OpenAI 5xx**: surface the message back so the Inngest step retries.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from typing import Any

from openai import OpenAI
from pydantic import BaseModel, Field

from ..storage import get_bytes, put_json, storage_keys

log = logging.getLogger(__name__)

_MAX_AUDIO_BYTES = 24 * 1024 * 1024  # 24 MB; OpenAI caps at 25 MB


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
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set on the worker. `fly secrets set "
            "OPENAI_API_KEY=… -a clipt-video-worker`.",
        )

    keys = storage_keys(payload.clip_id)
    workdir = tempfile.mkdtemp(prefix=f"clipt-tx-{payload.clip_id[:8]}-")
    mp4_path = os.path.join(workdir, "source.mp4")
    mp3_path = os.path.join(workdir, "audio.mp3")

    try:
        # 1. pull the source mp4 — boto3 download via our storage helper.
        log.info("transcribe: downloading source for clip_id=%s", payload.clip_id)
        mp4_bytes = get_bytes(payload.source_r2_key)
        with open(mp4_path, "wb") as f:
            f.write(mp4_bytes)

        # 2. extract mono 16 kHz mp3 (small + Whisper-friendly).
        log.info("transcribe: extracting audio with ffmpeg")
        _ffmpeg_extract_audio(mp4_path, mp3_path)

        audio_size = os.path.getsize(mp3_path)
        if audio_size > _MAX_AUDIO_BYTES:
            raise RuntimeError(
                f"Audio is {audio_size / 1024 / 1024:.1f} MB — over OpenAI's 25 MB cap. "
                "Phase 2 will chunk + stitch; today's clips should be under 60s anyway.",
            )

        # 3. call OpenAI Whisper.
        log.info("transcribe: posting to OpenAI Whisper (%.1f KB)", audio_size / 1024)
        client = OpenAI(api_key=api_key)
        with open(mp3_path, "rb") as fh:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=fh,
                response_format="verbose_json",
                timestamp_granularities=["word", "segment"],
            )

        # The OpenAI SDK returns a typed pydantic model — `.model_dump()`
        # gives us a plain dict to reshape from.
        raw = response.model_dump() if hasattr(response, "model_dump") else dict(response)

        # 4. shape into our CaptionsJson contract.
        captions = _to_captions_json(raw)
        word_count = sum(len(s.get("words", [])) for s in captions["segments"])
        language = captions["language"]

        # 5. persist.
        log.info("transcribe: writing captions JSON to %s", keys["captions_json"])
        put_json(keys["captions_json"], captions)

        return TranscribeOut(
            captionsR2Key=keys["captions_json"],
            language=language,
            wordCount=word_count,
            captionsJson=captions,
        )

    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _ffmpeg_extract_audio(src_mp4: str, dst_mp3: str) -> None:
    """Extract a mono 16 kHz mp3 from the source mp4.

    Mono + low sample rate gives Whisper-quality input at a fraction of
    the bytes. -b:a 64k is plenty for speech.
    """
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        src_mp4,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "64k",
        "-y",
        dst_mp3,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg audio extraction failed (exit {result.returncode}): "
            f"{result.stderr[:500]}",
        )


def _to_captions_json(raw: dict[str, Any]) -> dict[str, Any]:
    """Map OpenAI's verbose_json into our CaptionsJson shape.

    OpenAI returns word timestamps as a flat top-level array. Our schema
    nests words inside their segment so the CaptionEditor can show them
    in one block per cut. We bucket words into the segment whose
    [start, end] window contains the word's start time.
    """
    language = (raw.get("language") or "en")[:5]
    if language == "english":
        language = "en"

    raw_segments = raw.get("segments") or []
    raw_words = raw.get("words") or []

    # Bucket words into segments by start time.
    words_by_segment: list[list[dict[str, Any]]] = [[] for _ in raw_segments]
    seg_bounds = [(float(s.get("start", 0)), float(s.get("end", 0))) for s in raw_segments]

    for w in raw_words:
        ws = float(w.get("start", 0))
        idx = None
        for i, (lo, hi) in enumerate(seg_bounds):
            if lo <= ws <= hi:
                idx = i
                break
        # Words past the last segment's end (rare; rounding) fall into the last bucket.
        if idx is None and words_by_segment:
            idx = len(words_by_segment) - 1
        if idx is not None:
            words_by_segment[idx].append({
                "start": float(w.get("start", 0)),
                "end": float(w.get("end", 0)),
                "text": w.get("word") or w.get("text") or "",
            })

    segments: list[dict[str, Any]] = []
    for i, s in enumerate(raw_segments):
        segments.append({
            "id": s.get("id", i),
            "start": float(s.get("start", 0)),
            "end": float(s.get("end", 0)),
            "text": (s.get("text") or "").strip(),
            "words": words_by_segment[i] if i < len(words_by_segment) else [],
        })

    # Handle the silent-clip case: no segments, no words.
    if not segments:
        return {"language": language, "segments": []}

    return {"language": language, "segments": segments}

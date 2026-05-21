"""POST /jobs/detect-face-cam — vision-based face-cam corner detection.

Replaces flaky MediaPipe-based per-clip detection. Samples a few frames
from the source video + asks an OpenAI vision model to identify which
corner the streamer's face cam widget sits in. Result is a single named
corner (or "none" for a talking-head / no-cam setup), which the Inngest
function caches back to the channel row so it only runs once per channel.

Two input modes:
  - `sourceR2Key` — pull bytes from S3 (used for per-clip backstop when
    the channel hasn't been pre-analyzed). Frames sampled at 3/12/24s.
  - `sourceUrl`   — stream via ffmpeg's `-i` (works for HLS m3u8 from
    Twitch VOD playback). Frames sampled at 60/300/600/1800s by default
    — long VODs give the model varied gameplay over a real session so a
    cam-on-the-game-character is harder to confuse with a cam widget.

Why vision beats face detection:
  - Distinguishes "OBS face cam widget" from "game character" trivially
    — vision models read the semantic content, not just pixel features.
  - Works for tiny corner cams that MediaPipe misses entirely.
  - Works for dark gameplay scenes that fool classical detectors.
  - One ~$0.02 call per channel, cached forever after.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from ..auth import verify_bearer
from ..storage import get_bytes

log = logging.getLogger(__name__)

router = APIRouter()

CornerStr = Literal["top_left", "top_right", "bottom_left", "bottom_right", "none"]

# Defaults for the S3-clip path (≤60s sources).
_CLIP_OFFSETS_S = (3.0, 12.0, 24.0)
# Defaults for the VOD path. Real session VODs are hours long; spaced
# samples beat clustered ones because gameplay rotates through menus,
# combat, cutscenes — only the cam stays put.
_VOD_OFFSETS_S = (60.0, 300.0, 600.0, 1800.0)

_PROMPT = """\
You're looking at frames from a Twitch livestream. The streamer
typically has a small webcam widget showing their face overlaid in one
corner of the screen, on top of their gameplay or content.

Identify which corner of the source frame the face-camera widget sits
in. Pick exactly one:
  - "top_left"
  - "top_right"
  - "bottom_left"
  - "bottom_right"
  - "none" — if the cam fills the entire screen (a talking-head
    streamer with no game), if there's no visible cam at all, or if
    the cam is centred / non-corner.

Look at ALL the frames before deciding — the cam stays in the same
position across frames, while the gameplay changes. The cam is the
static element with a human face. If different frames suggest
different corners, the model is being fooled by an in-game character —
trust the one corner that holds across the most frames.
"""


class DetectFaceCamIn(BaseModel):
    source_r2_key: str | None = Field(default=None, alias="sourceR2Key")
    source_url: str | None = Field(default=None, alias="sourceUrl")
    sample_offsets_sec: list[float] | None = Field(
        default=None, alias="sampleOffsetsSec"
    )
    model_config = {"populate_by_name": True}


class DetectFaceCamOut(BaseModel):
    corner: str | None
    """One of `top_left`/`top_right`/`bottom_left`/`bottom_right`,
    or None when the vision model returned "none"."""

    frames_sampled: int = Field(default=0, alias="framesSampled")
    """How many frames actually made it to the vision model — useful
    for telling apart a confident "none" (3 good frames) from a
    no-signal failure (0 frames, ffmpeg couldn't seek)."""

    model_config = {"populate_by_name": True}


def _extract_frames_from_path(
    workdir: str, src_path: str, offsets: tuple[float, ...] | list[float]
) -> list[str]:
    """Pull JPEG frames at the given offsets from a local mp4. Scales
    to ≤960w so the upload payload stays small."""
    out: list[str] = []
    for i, offset in enumerate(offsets):
        path = os.path.join(workdir, f"f{i}.jpg")
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(offset), "-i", src_path,
            "-frames:v", "1", "-q:v", "3",
            "-vf", "scale=960:-2",
            path,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0 and os.path.exists(path):
            out.append(path)
    return out


def _extract_frames_from_url(
    workdir: str, url: str, offsets: tuple[float, ...] | list[float]
) -> list[str]:
    """Stream frames from a remote URL (HLS m3u8 or direct mp4). One
    ffmpeg invocation per offset — re-seeking is the simple,
    reliable path for HLS, even if it costs a few extra seconds.

    `-ss` BEFORE `-i` is keyframe-fast input seek; for HLS Twitch
    VODs this jumps to the correct .ts segment without decoding the
    preceding hours."""
    out: list[str] = []
    for i, offset in enumerate(offsets):
        path = os.path.join(workdir, f"f{i}.jpg")
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-user_agent", "Mozilla/5.0",
            "-ss", str(offset), "-i", url,
            "-frames:v", "1", "-q:v", "3",
            "-vf", "scale=960:-2",
            path,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if res.returncode == 0 and os.path.exists(path):
            out.append(path)
        else:
            log.warning(
                "detect-face-cam: ffmpeg failed for offset=%s url=%s err=%s",
                offset, url, (res.stderr or "")[:200],
            )
    return out


def _run_vision_on_frames(frame_paths: list[str]) -> str | None:
    """Encode + send to OpenAI with structured-output schema.
    Returns 'top_left'/'top_right'/'bottom_left'/'bottom_right'/'none'
    or None if parsing fails."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")

    contents: list[dict] = [{"type": "text", "text": _PROMPT}]
    for p in frame_paths:
        with open(p, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        contents.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{b64}",
                "detail": "low",
            },
        })

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": contents}],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "face_cam_corner",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "corner": {
                            "type": "string",
                            "enum": [
                                "top_left", "top_right",
                                "bottom_left", "bottom_right",
                                "none",
                            ],
                        },
                    },
                    "required": ["corner"],
                    "additionalProperties": False,
                },
            },
        },
    )

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
        return parsed.get("corner")
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI vision returned malformed JSON: {raw[:200]} ({exc})",
        )


@router.post("/jobs/detect-face-cam", response_model=DetectFaceCamOut)
def detect_face_cam(
    payload: DetectFaceCamIn,
    _claims: dict = Depends(verify_bearer),
) -> DetectFaceCamOut:
    if not payload.source_r2_key and not payload.source_url:
        raise HTTPException(
            status_code=400,
            detail="One of sourceR2Key or sourceUrl is required.",
        )

    workdir = tempfile.mkdtemp(prefix="detect-face-cam-")
    try:
        # Path A: pull bytes from S3.
        if payload.source_r2_key:
            src_path = os.path.join(workdir, "source.mp4")
            try:
                with open(src_path, "wb") as f:
                    f.write(get_bytes(payload.source_r2_key))
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=404,
                    detail=f"Couldn't fetch {payload.source_r2_key}: {exc}",
                )
            offsets = tuple(payload.sample_offsets_sec or _CLIP_OFFSETS_S)
            frame_paths = _extract_frames_from_path(workdir, src_path, offsets)
            mode = "r2"
        # Path B: stream directly from a URL (Twitch VOD m3u8).
        else:
            offsets = tuple(payload.sample_offsets_sec or _VOD_OFFSETS_S)
            frame_paths = _extract_frames_from_url(
                workdir, payload.source_url, offsets,
            )
            mode = "url"

        if not frame_paths:
            log.warning(
                "detect-face-cam: no frames produced (mode=%s offsets=%s)",
                mode, offsets,
            )
            return DetectFaceCamOut(corner=None, frames_sampled=0)

        corner_val = _run_vision_on_frames(frame_paths)

        log.info(
            "detect-face-cam: mode=%s frames=%d → corner=%s",
            mode, len(frame_paths), corner_val,
        )
        return DetectFaceCamOut(
            corner=None if corner_val == "none" else corner_val,
            frames_sampled=len(frame_paths),
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

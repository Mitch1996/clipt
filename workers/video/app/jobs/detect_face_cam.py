"""POST /jobs/detect-face-cam — vision-based face-cam corner detection.

Replaces flaky MediaPipe-based per-clip detection for the auto-corner
step. Extracts 3 evenly-spaced frames from the source mp4 + asks an
OpenAI vision model to identify which corner the streamer's face cam
widget sits in. Result is a single named corner (or "none" for a
talking-head / no-cam setup), which the Inngest function caches back
to the channel row so it only runs once per channel.

Why this beats face detection:
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

# Pulled from a few representative streamer sources — these timestamps
# (in seconds from the start) give the vision model varied gameplay
# states to discount + a consistent cam position across all three.
_SAMPLE_OFFSETS_S = (3.0, 12.0, 24.0)

_PROMPT = """\
You're looking at three frames from a Twitch livestream. The streamer
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

Look at all three frames before deciding — the cam stays in the same
position across frames, while the gameplay changes. The cam is the
static element with a human face.
"""


class DetectFaceCamIn(BaseModel):
    source_r2_key: str = Field(alias="sourceR2Key")
    model_config = {"populate_by_name": True}


class DetectFaceCamOut(BaseModel):
    corner: str | None
    """One of `top_left`/`top_right`/`bottom_left`/`bottom_right`,
    or None when the vision model returned "none"."""


@router.post("/jobs/detect-face-cam", response_model=DetectFaceCamOut)
def detect_face_cam(
    payload: DetectFaceCamIn,
    _claims: dict = Depends(verify_bearer),
) -> DetectFaceCamOut:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")

    workdir = tempfile.mkdtemp(prefix="detect-face-cam-")
    try:
        # 1. Download the source mp4.
        src_path = os.path.join(workdir, "source.mp4")
        try:
            with open(src_path, "wb") as f:
                f.write(get_bytes(payload.source_r2_key))
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=404,
                detail=f"Couldn't fetch {payload.source_r2_key}: {exc}",
            )

        # 2. Extract three frames via ffmpeg. If the source is shorter
        #    than 24s (typical live_auto clip is 30s, paste-URL Twitch
        #    clips are 30-60s), we just clamp to within range.
        frame_paths: list[str] = []
        for i, offset in enumerate(_SAMPLE_OFFSETS_S):
            out = os.path.join(workdir, f"f{i}.jpg")
            cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-ss", str(offset), "-i", src_path,
                "-frames:v", "1", "-q:v", "3",
                # Scale to ≤960w so the upload payload stays tiny.
                # The vision model only needs to see the cam corner,
                # not pixel-perfect detail.
                "-vf", "scale=960:-2",
                out,
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode == 0 and os.path.exists(out):
                frame_paths.append(out)
        if not frame_paths:
            raise HTTPException(
                status_code=500,
                detail="ffmpeg produced no sample frames",
            )

        # 3. Encode + send to OpenAI with structured-output schema.
        contents: list[dict] = [{"type": "text", "text": _PROMPT}]
        for p in frame_paths:
            with open(p, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            contents.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
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
            corner_val = parsed.get("corner")
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"OpenAI vision returned malformed JSON: {raw[:200]} ({exc})",
            )

        log.info(
            "detect-face-cam: source=%s frames=%d → corner=%s",
            payload.source_r2_key, len(frame_paths), corner_val,
        )
        return DetectFaceCamOut(
            corner=None if corner_val == "none" else corner_val,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

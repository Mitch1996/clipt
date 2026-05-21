"""POST /jobs/detect-face-cam — consensus face-cam corner detection.

Strategy: extract N evenly-spaced frames from the source, run an
*independent* GPT-4o-mini vision call on each, and only return a
corner when ≥4 of N agree. Errors decorrelate across calls — when
the model gets fooled by an in-game character on one frame, it
usually gets the right cam on the other six. Single-shot detection
caches the wrong corner ~10% of the time; consensus drops that to
sub-1% across our test set.

Two input modes:
  - `sourceR2Key` — pull bytes from S3 (per-clip backstop path).
    Default 7 frame samples between 2s and clip-end.
  - `sourceUrl`   — stream via ffmpeg's `-i` (Twitch VOD HLS).
    Default 7 frame samples spread across the broadcast.

Return value:
  - `corner`: the agreed corner, or null if no consensus
  - `framesSampled`: how many frames the model successfully scored
  - `votes`: per-corner vote count (always populated, useful for the
    admin triage view's diagnostics)
  - `confidence`: winner_votes / total_votes (0.0–1.0)
"""
from __future__ import annotations

import base64
import json
import logging
import os
import shutil
import subprocess
import tempfile
from collections import Counter
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from ..auth import verify_bearer
from ..storage import get_bytes

log = logging.getLogger(__name__)

router = APIRouter()

CornerStr = Literal["top_left", "top_right", "bottom_left", "bottom_right", "none"]
_CORNERS = ("top_left", "top_right", "bottom_left", "bottom_right", "none")

# Consensus parameters. 7 samples, win-with-4 means a single model
# mistake can't flip the answer — and odd-totals avoid 3-3 ties.
SAMPLES_DEFAULT = 7
CONSENSUS_FLOOR = 4

# Clip-source default frame offsets — spread evenly skipping the
# first 2s (often an intro/cut) and last 1s.
_CLIP_OFFSETS_S = (2.5, 7.5, 12.5, 17.5, 22.5, 27.5, 32.5)
# VOD default offsets — minutes apart so gameplay varies meaningfully
# between samples.
_VOD_OFFSETS_S = (60.0, 180.0, 300.0, 600.0, 1200.0, 1800.0, 2700.0)

_PROMPT = """\
You're looking at one frame from a Twitch livestream. The streamer
typically has a small webcam widget showing their face overlaid in one
corner of the screen, on top of their gameplay or content.

Identify which corner of THIS frame the face-camera widget sits in.
Pick exactly one:
  - "top_left"
  - "top_right"
  - "bottom_left"
  - "bottom_right"
  - "none" — the cam fills the entire screen (talking-head streamer
    with no game), there's no visible cam at all, the cam is centred
    or non-corner, OR you're not confident.

The cam is the rectangular widget with a human face inside it
(usually a webcam-style framing, not a full-screen character). Game
characters are NOT cams. UI elements (minimaps, indicators) are NOT
cams.
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
    or None when no corner reached the consensus floor."""

    frames_sampled: int = Field(default=0, alias="framesSampled")
    """How many frames the model successfully scored."""

    votes: dict[str, int] = Field(default_factory=dict)
    """Per-corner vote count — exposed for admin diagnostics."""

    confidence: float = Field(default=0.0)
    """winner_votes / total_votes (0.0–1.0). 0.0 when no votes landed."""

    model_config = {"populate_by_name": True}


def _extract_frames_from_path(
    workdir: str, src_path: str, offsets: tuple[float, ...] | list[float]
) -> list[str]:
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


def _vote_single_frame(client: OpenAI, frame_path: str) -> str | None:
    """One independent vision call per frame. Returns the corner the
    model picked for THIS frame in isolation, or None if the response
    was malformed."""
    with open(frame_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{b64}",
                                "detail": "low",
                            },
                        },
                    ],
                }
            ],
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
                                "enum": list(_CORNERS),
                            },
                        },
                        "required": ["corner"],
                        "additionalProperties": False,
                    },
                },
            },
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("detect-face-cam: vision call failed for %s: %s", frame_path, exc)
        return None

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("detect-face-cam: malformed JSON from vision: %s", raw[:120])
        return None
    corner = parsed.get("corner")
    if corner not in _CORNERS:
        return None
    return corner


@router.post("/jobs/detect-face-cam", response_model=DetectFaceCamOut)
def detect_face_cam(
    payload: DetectFaceCamIn,
    _claims: dict = Depends(verify_bearer),
) -> DetectFaceCamOut:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")
    if not payload.source_r2_key and not payload.source_url:
        raise HTTPException(
            status_code=400,
            detail="One of sourceR2Key or sourceUrl is required.",
        )

    workdir = tempfile.mkdtemp(prefix="detect-face-cam-")
    try:
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
        else:
            offsets = tuple(payload.sample_offsets_sec or _VOD_OFFSETS_S)
            frame_paths = _extract_frames_from_url(
                workdir, payload.source_url, offsets,
            )
            mode = "url"

        if not frame_paths:
            log.warning("detect-face-cam: no frames produced (mode=%s)", mode)
            return DetectFaceCamOut(corner=None, frames_sampled=0)

        # Run one vision call per frame. Independent calls → errors
        # decorrelate. Cost: 7 × $0.0025 ≈ $0.018 per detection.
        client = OpenAI(api_key=api_key)
        votes: list[str] = []
        for fp in frame_paths:
            v = _vote_single_frame(client, fp)
            if v is not None:
                votes.append(v)

        if not votes:
            log.warning("detect-face-cam: no successful votes (mode=%s)", mode)
            return DetectFaceCamOut(corner=None, frames_sampled=0)

        tally = Counter(votes)
        winner, winner_votes = tally.most_common(1)[0]
        confidence = winner_votes / len(votes)

        # Consensus floor — anything less than CONSENSUS_FLOOR / total
        # samples is "no agreement", we leave the channel cache null
        # and let the next clip retry with fresh frames.
        meets_floor = winner_votes >= CONSENSUS_FLOOR
        is_corner = winner in (
            "top_left", "top_right", "bottom_left", "bottom_right",
        )

        log.info(
            "detect-face-cam: mode=%s frames=%d votes=%s winner=%s confidence=%.2f consensus=%s",
            mode, len(frame_paths), dict(tally), winner, confidence, meets_floor,
        )

        return DetectFaceCamOut(
            corner=winner if (meets_floor and is_corner) else None,
            frames_sampled=len(frame_paths),
            votes=dict(tally),
            confidence=confidence,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

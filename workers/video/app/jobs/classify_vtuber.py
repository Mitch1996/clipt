"""POST /jobs/classify-vtuber — classify a streamer as VTuber or human.

Same 7-frame consensus shape as detect-face-cam, but the model is asked
a yes/no question per frame: "is the on-camera streamer a real human
face or an animated avatar?". Result drives which post-render
verification path runs:

  - human    → MediaPipe face detection on the rendered cam band
  - VTuber   → second vision call on the rendered cam band asking
               "is this a streamer overlay or gameplay?"

We classify once on channel/added and cache to channels.is_vtuber.
Misclassification is recoverable (the verification step will fail and
re-detection will kick in), so we don't need to be precision-perfect
here — just fast.
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

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from ..auth import verify_bearer
from ..storage import get_bytes

log = logging.getLogger(__name__)

router = APIRouter()

SAMPLES_DEFAULT = 7
CONSENSUS_FLOOR = 4

_CLIP_OFFSETS_S = (2.5, 7.5, 12.5, 17.5, 22.5, 27.5, 32.5)
_VOD_OFFSETS_S = (60.0, 180.0, 300.0, 600.0, 1200.0, 1800.0, 2700.0)

_PROMPT = """\
You're looking at one frame from a Twitch livestream. There's typically
a small webcam-style widget showing the streamer somewhere on screen.

Classify what kind of on-camera presence this streamer uses:
  - "human"    — the cam shows a real human face (any framing, any
                 face cam size, including tiny corner cams)
  - "vtuber"   — the cam shows an animated avatar (Live2D, VRoid,
                 stylised character) standing in for the streamer
  - "none"     — no visible cam / overlay at all OR you can't tell

If the frame is mostly game content and the cam is too small to
discern, return "none".
"""


class ClassifyVtuberIn(BaseModel):
    source_url: str | None = Field(default=None, alias="sourceUrl")
    source_r2_key: str | None = Field(default=None, alias="sourceR2Key")
    sample_offsets_sec: list[float] | None = Field(
        default=None, alias="sampleOffsetsSec"
    )
    model_config = {"populate_by_name": True}


class ClassifyVtuberOut(BaseModel):
    is_vtuber: bool | None = Field(default=None, alias="isVtuber")
    frames_sampled: int = Field(default=0, alias="framesSampled")
    confidence: float = Field(default=0.0)
    model_config = {"populate_by_name": True}


def _extract_frames(
    workdir: str, source: str, offsets: tuple[float, ...] | list[float], is_url: bool,
) -> list[str]:
    out: list[str] = []
    for i, offset in enumerate(offsets):
        path = os.path.join(workdir, f"f{i}.jpg")
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        ]
        if is_url:
            cmd += ["-user_agent", "Mozilla/5.0"]
        cmd += [
            "-ss", str(offset), "-i", source,
            "-frames:v", "1", "-q:v", "3",
            "-vf", "scale=960:-2",
            path,
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        except subprocess.TimeoutExpired:
            continue
        if res.returncode == 0 and os.path.exists(path):
            out.append(path)
    return out


def _vote_single_frame(client: OpenAI, frame_path: str) -> str | None:
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
                    "name": "vtuber_classification",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "kind": {
                                "type": "string",
                                "enum": ["human", "vtuber", "none"],
                            },
                        },
                        "required": ["kind"],
                        "additionalProperties": False,
                    },
                },
            },
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("classify-vtuber: vision call failed for %s: %s", frame_path, exc)
        return None

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    kind = parsed.get("kind")
    if kind not in ("human", "vtuber", "none"):
        return None
    return kind


@router.post("/jobs/classify-vtuber", response_model=ClassifyVtuberOut)
def classify_vtuber(
    payload: ClassifyVtuberIn,
    _claims: dict = Depends(verify_bearer),
) -> ClassifyVtuberOut:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")
    if not payload.source_url and not payload.source_r2_key:
        raise HTTPException(
            status_code=400,
            detail="One of sourceUrl or sourceR2Key is required.",
        )

    workdir = tempfile.mkdtemp(prefix="classify-vtuber-")
    try:
        if payload.source_url:
            offsets = tuple(payload.sample_offsets_sec or _VOD_OFFSETS_S)
            frame_paths = _extract_frames(
                workdir, payload.source_url, offsets, is_url=True,
            )
        else:
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
            frame_paths = _extract_frames(workdir, src_path, offsets, is_url=False)

        if not frame_paths:
            log.warning("classify-vtuber: no frames produced")
            return ClassifyVtuberOut(is_vtuber=None, frames_sampled=0)

        client = OpenAI(api_key=api_key)
        votes: list[str] = []
        for fp in frame_paths:
            v = _vote_single_frame(client, fp)
            if v is not None:
                votes.append(v)

        if not votes:
            return ClassifyVtuberOut(is_vtuber=None, frames_sampled=0)

        tally = Counter(votes)
        # We classify is_vtuber as TRUE only when "vtuber" clearly wins
        # AND beats "human" by at least the consensus floor. "none"
        # votes are treated as no signal — they push toward inconclusive
        # rather than toward one answer.
        vtuber_votes = tally.get("vtuber", 0)
        human_votes = tally.get("human", 0)
        winner, winner_n = tally.most_common(1)[0]
        confidence = winner_n / len(votes)

        is_vtuber: bool | None
        if vtuber_votes >= CONSENSUS_FLOOR and vtuber_votes > human_votes:
            is_vtuber = True
        elif human_votes >= CONSENSUS_FLOOR and human_votes > vtuber_votes:
            is_vtuber = False
        else:
            is_vtuber = None

        log.info(
            "classify-vtuber: votes=%s → is_vtuber=%s confidence=%.2f",
            dict(tally), is_vtuber, confidence,
        )

        return ClassifyVtuberOut(
            is_vtuber=is_vtuber,
            frames_sampled=len(frame_paths),
            confidence=confidence,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

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
MAY have a small webcam widget showing their face overlaid in one
corner of the screen, on top of their gameplay or content. But some
streamers don't show a cam at all.

Identify which corner of THIS frame the face-camera widget sits in.
Pick exactly one:
  - "top_left"
  - "top_right"
  - "bottom_left"
  - "bottom_right"
  - "none" — pick this whenever ANY of these are true:
      • there's no visible cam at all (pure gameplay-only stream)
      • the cam fills the entire screen (talking-head, no game)
      • the cam is centred or mid-edge (not in a corner)
      • you're not confident which corner the cam is in

What COUNTS as a cam:
  • A rectangular webcam-style frame containing a real human face
  • An animated VTuber avatar in a similar widget
  • Usually has a visible border, name overlay, or alert frame

What does NOT count as a cam (return "none" instead of picking these):
  • Minimaps (small map of the game world in a corner)
  • Kill feeds / death notifications
  • HUD elements: health bars, ammo counters, score displays
  • In-game character portraits (Apex Legends panels, Overwatch hero icons)
  • Inventory widgets, ability cooldown bars
  • Stream alerts (subscriber pop-ups, donation banners)
  • Chat overlays
  • Game logos or watermarks

When in doubt, return "none". A wrong corner pick produces a
permanently broken render; "none" just means we try again later.
"""

# Post-consensus confirmation prompt. After 7 votes pick a winner, we
# crop that corner from a sample frame and ask the model to confirm
# the crop is actually a webcam — catches "vision is confidently
# wrong" failures that consensus alone won't fix.
_CONFIRM_PROMPT = """\
You're looking at a cropped region from a streamer's source video.
Does this crop show a webcam widget — a rectangular frame containing
a real human face OR an animated VTuber avatar?

Answer "yes" only if you can clearly see a person (or VTuber model)
inside a webcam-style framing.

Answer "no" if the crop shows:
  • Gameplay (game world, characters, action)
  • A minimap or map overlay
  • HUD elements (health, ammo, score, kill feed)
  • A character portrait that is part of the game UI (not a separate
    webcam widget)
  • Anything else that isn't a webcam
"""

# Corner preset rectangle (matches reframe.py _corner_preset_region).
# 22% wide × 27% tall, inset 2% from the edge. We use the same
# numbers here so the confirmation crop matches what the renderer
# would actually composite into the top band.
_CAM_W_NORM = 0.22
_CAM_H_NORM = 0.27
_CAM_INSET = 0.02


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


def _crop_corner(
    frame_path: str, corner: str, out_path: str,
) -> bool:
    """Pillow-crop the named corner region from a JPEG frame. Returns
    True on success. Geometry mirrors reframe.py's _corner_preset_region
    so what we send to the confirm step is exactly what the renderer
    would composite into the top band."""
    try:
        from PIL import Image
    except ImportError:
        log.warning("detect-face-cam: Pillow unavailable, skipping confirm crop")
        return False
    try:
        img = Image.open(frame_path)
        w, h = img.size
        cw = int(round(_CAM_W_NORM * w))
        ch = int(round(_CAM_H_NORM * h))
        inset_w = int(round(_CAM_INSET * w))
        inset_h = int(round(_CAM_INSET * h))
        if corner == "top_left":
            box = (inset_w, inset_h, inset_w + cw, inset_h + ch)
        elif corner == "top_right":
            box = (w - inset_w - cw, inset_h, w - inset_w, inset_h + ch)
        elif corner == "bottom_left":
            box = (inset_w, h - inset_h - ch, inset_w + cw, h - inset_h)
        elif corner == "bottom_right":
            box = (w - inset_w - cw, h - inset_h - ch, w - inset_w, h - inset_h)
        else:
            return False
        img.crop(box).save(out_path, "JPEG", quality=85)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("detect-face-cam: crop failed: %s", exc)
        return False


def _confirm_corner_is_cam(
    client: OpenAI, crop_paths: list[str],
) -> bool | None:
    """One vision call with N corner crops. Asks: "is this a webcam?"
    Returns True if any crop is confirmed as a webcam (we forgive a
    single bad frame), False if all crops are confidently non-cam,
    None on API failure (caller decides what to do)."""
    contents: list[dict] = [{"type": "text", "text": _CONFIRM_PROMPT}]
    for p in crop_paths:
        try:
            with open(p, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
        except OSError:
            continue
        contents.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{b64}",
                "detail": "low",
            },
        })
    if len(contents) < 2:
        return None

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": contents}],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "confirm_cam",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "is_webcam": {
                                "type": "boolean",
                            },
                        },
                        "required": ["is_webcam"],
                        "additionalProperties": False,
                    },
                },
            },
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("detect-face-cam: confirm call failed: %s", exc)
        return None

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return bool(parsed.get("is_webcam"))


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

        # Post-consensus confirmation. Catches "vision is confidently
        # wrong" failures — e.g., a streamer with a minimap top-left
        # where every frame votes top_left but the region isn't
        # actually a webcam. We crop the winning corner from up to 3
        # sample frames and ask the model "is this crop a webcam?".
        # A consensus winner that fails confirmation gets demoted to
        # None so per-clip detection retries on real clip frames
        # rather than locking in a wrong answer.
        confirmed = True
        if meets_floor and is_corner:
            confirm_paths: list[str] = []
            for i, fp in enumerate(frame_paths[:3]):
                cp = os.path.join(workdir, f"confirm-{i}.jpg")
                if _crop_corner(fp, winner, cp):
                    confirm_paths.append(cp)
            if confirm_paths:
                result = _confirm_corner_is_cam(client, confirm_paths)
                if result is False:
                    confirmed = False
                    log.warning(
                        "detect-face-cam: consensus winner=%s REJECTED by confirmation pass (crop is not a webcam)",
                        winner,
                    )
                # result is None → API failure, trust the consensus
                # rather than killing detection on a flaky external
                # call. Same forgiveness as the per-frame vote path.

        final_corner = (
            winner if (meets_floor and is_corner and confirmed) else None
        )

        log.info(
            "detect-face-cam: mode=%s frames=%d votes=%s winner=%s confidence=%.2f consensus=%s confirmed=%s → %s",
            mode, len(frame_paths), dict(tally), winner, confidence,
            meets_floor, confirmed, final_corner,
        )

        return DetectFaceCamOut(
            corner=final_corner,
            frames_sampled=len(frame_paths),
            votes=dict(tally),
            confidence=confidence,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

"""POST /jobs/reframe — 9:16 reframe with face tracking + caption burn.

Pipeline
========
1. Download the source mp4 + (optional) captions JSON from storage.
2. ffprobe the source for width/height/fps/duration.
3. Sample focus points at 5 fps with MediaPipe face detection. The
   focus point is the X-center of the largest face (normalized 0–1 of
   source width); we fall back to centre when no face is found.
4. Smooth the track with a 1-second moving average so the crop doesn't
   judder between adjacent samples.
5. Render frame-by-frame with OpenCV:
     a. crop a 9:16 column centred on the interpolated focus point for
        that frame's timestamp,
     b. resize to 1080×1920,
     c. composite captions in the bottom third with Pillow (the active
        word — looked up from the flat word-timing array Whisper hands
        us — is highlighted brand-yellow),
     d. composite the @handle attribution badge in the top-right.
   Each frame is piped as raw BGR to a single ffmpeg encoder.
6. ffmpeg encodes h264-baseline @ 1080×1920 30fps + muxes audio from the
   source, and (when supplied) embeds the attribution JWT via
   `-metadata clipt_attribution=<jwt>`.
7. A second ffmpeg call extracts a JPG thumbnail at 1.5s from the rendered
   vertical (so the thumb has captions + badge baked in).
8. Both artifacts are pushed to S3 at the canonical keys.

Performance: on Fly perf-1x (4GB CPU) we hit roughly 50 fps of pipeline
throughput for 1080p sources — well inside the < 1× realtime budget for
the 30-second clips we ship today.
"""
from __future__ import annotations

import json
import logging
import math
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Any

import urllib.request

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision as mp_vision
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from ..storage import get_bytes, put_bytes, storage_keys

log = logging.getLogger(__name__)

# MediaPipe model cache. The legacy `mp.solutions.face_detection`
# namespace was dropped in 0.10.x — Tasks API is the supported path
# and it needs an explicit .tflite model bundle.
_MODEL_PATH = "/tmp/clipt-models/face_detector.tflite"
_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/"
    "blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
)


def _ensure_face_model() -> str:
    if not os.path.exists(_MODEL_PATH):
        os.makedirs(os.path.dirname(_MODEL_PATH), exist_ok=True)
        log.info("reframe: downloading face-detector model (~230 KB)")
        urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)
    return _MODEL_PATH

# ─── Render constants ─────────────────────────────────────────────────

TARGET_W = 1080
TARGET_H = 1920
TARGET_FPS = 30
SAMPLE_FPS = 5
SMOOTH_WINDOW_S = 1.0

# Brand colours. The design system (CLAUDE.md) pins the active-word
# highlight to electric currency-yellow and reserves mint for value-flow
# signals — the verified-attribution badge counts as one.
ACCENT_HEX = "#FFE600"
MINT_HEX = "#34D399"
STROKE_HEX = "#000000"
TEXT_HEX = "#FFFFFF"

# Bundled by `fonts-dejavu-core` in the Dockerfile.
FONT_PATH_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

CAPTION_FONT_SIZE = 64
CAPTION_BOTTOM_PAD = 220
CAPTION_LINE_GAP = 14
CAPTION_MAX_WIDTH_RATIO = 0.85
CAPTION_STROKE_WIDTH = 4

BADGE_FONT_SIZE = 36
BADGE_PAD_X = 22
BADGE_PAD_Y = 12
BADGE_MARGIN = 36


# ─── Wire contract ────────────────────────────────────────────────────


class ReframeIn(BaseModel):
    clip_id: str = Field(alias="clipId")
    source_r2_key: str = Field(alias="sourceR2Key")
    captions_r2_key: str | None = Field(default=None, alias="captionsR2Key")
    style: str = "default"
    # Attribution JWT bakes into mp4 metadata so any consumer with our
    # public key can verify the clip's origin offline.
    attribution_token: str | None = Field(default=None, alias="attributionToken")
    # Drives the @handle pill in the top-right.
    creator_handle: str | None = Field(default=None, alias="creatorHandle")

    model_config = {"populate_by_name": True}


class ReframeOut(BaseModel):
    vertical_r2_key: str = Field(alias="verticalR2Key")
    thumbnail_r2_key: str = Field(alias="thumbnailR2Key")
    width: int = TARGET_W
    height: int = TARGET_H

    model_config = {"populate_by_name": True}


# ─── Public entrypoint ───────────────────────────────────────────────


def run(payload: ReframeIn) -> ReframeOut:
    keys = storage_keys(payload.clip_id)
    workdir = tempfile.mkdtemp(prefix=f"clipt-rf-{payload.clip_id[:8]}-")
    src_mp4 = os.path.join(workdir, "source.mp4")
    out_mp4 = os.path.join(workdir, "vertical.mp4")
    thumb_jpg = os.path.join(workdir, "thumb.jpg")

    try:
        log.info("reframe: downloading source for clip_id=%s", payload.clip_id)
        with open(src_mp4, "wb") as f:
            f.write(get_bytes(payload.source_r2_key))

        captions = _load_captions(payload.captions_r2_key)

        probe = _ffprobe_video(src_mp4)
        log.info(
            "reframe: probe %dx%d @ %.2ffps duration=%.2fs",
            probe.width, probe.height, probe.fps, probe.duration_s,
        )

        focus_track = _sample_focus_track(src_mp4, probe, SAMPLE_FPS)
        focus_track = _smooth_track(focus_track, SMOOTH_WINDOW_S)

        log.info("reframe: rendering 1080x1920 mp4")
        _render_vertical(
            src_mp4=src_mp4,
            out_mp4=out_mp4,
            probe=probe,
            focus_track=focus_track,
            captions=captions,
            handle=_clean_handle(payload.creator_handle),
            attribution_token=payload.attribution_token,
        )

        _extract_thumbnail(out_mp4, thumb_jpg)

        log.info("reframe: uploading vertical + thumbnail")
        with open(out_mp4, "rb") as f:
            put_bytes(keys["vertical_mp4"], f.read(), "video/mp4")
        with open(thumb_jpg, "rb") as f:
            put_bytes(keys["thumbnail_jpg"], f.read(), "image/jpeg")

        return ReframeOut(
            verticalR2Key=keys["vertical_mp4"],
            thumbnailR2Key=keys["thumbnail_jpg"],
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ─── Probe + captions ─────────────────────────────────────────────────


@dataclass(frozen=True)
class VideoProbe:
    width: int
    height: int
    fps: float
    duration_s: float


def _ffprobe_video(path: str) -> VideoProbe:
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,duration",
        "-show_entries", "format=duration",
        "-of", "json",
        path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr[:300]}")
    raw = json.loads(result.stdout)
    if not raw.get("streams"):
        raise RuntimeError("ffprobe returned no video stream")
    stream = raw["streams"][0]
    width = int(stream["width"])
    height = int(stream["height"])
    num, _, den = (stream.get("r_frame_rate") or "30/1").partition("/")
    fps = float(num) / float(den or 1) if den else float(num)
    duration_s = float(
        stream.get("duration")
        or raw.get("format", {}).get("duration")
        or 0.0,
    )
    if duration_s <= 0:
        raise RuntimeError("ffprobe could not determine duration")
    return VideoProbe(width=width, height=height, fps=fps, duration_s=duration_s)


def _load_captions(captions_key: str | None) -> dict[str, Any] | None:
    if not captions_key:
        return None
    try:
        raw = get_bytes(captions_key)
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        log.warning("reframe: captions load failed (%s) — rendering without burn-in", exc)
        return None


# ─── Face tracking ────────────────────────────────────────────────────


def _sample_focus_track(src_mp4: str, probe: VideoProbe, sample_fps: int) -> list[tuple[float, float]]:
    """Return [(t_seconds, focus_x_norm), ...] sampled at sample_fps.

    Uses MediaPipe Tasks API (Solutions API is gone in 0.10.x). The
    detector returns bounding boxes in pixel coords of the input image,
    so we normalize against the small frame width.
    """
    options = mp_vision.FaceDetectorOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=_ensure_face_model()),
        running_mode=mp_vision.RunningMode.IMAGE,
        min_detection_confidence=0.4,
    )
    detector = mp_vision.FaceDetector.create_from_options(options)

    cap = cv2.VideoCapture(src_mp4)
    if not cap.isOpened():
        raise RuntimeError("OpenCV could not open source mp4")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or probe.fps
    stride = max(1, int(round(src_fps / sample_fps)))

    track: list[tuple[float, float]] = []
    frame_idx = 0
    last_focus = 0.5
    try:
        while True:
            ok = cap.grab()
            if not ok:
                break
            if frame_idx % stride == 0:
                ok, frame = cap.retrieve()
                if not ok:
                    break
                # Downscale for detection speed — Blaze short-range only
                # needs ~128px of face anyway.
                h, w = frame.shape[:2]
                if w > 640:
                    scale = 640 / w
                    small = cv2.resize(frame, (int(w * scale), int(h * scale)))
                else:
                    small = frame
                rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = detector.detect(mp_img)
                t = frame_idx / max(src_fps, 1.0)
                if result.detections:
                    sw = small.shape[1]
                    best = max(
                        result.detections,
                        key=lambda d: d.bounding_box.width * d.bounding_box.height,
                    )
                    bb = best.bounding_box
                    cx = (bb.origin_x + bb.width / 2) / max(sw, 1)
                    last_focus = max(0.0, min(1.0, cx))
                track.append((t, last_focus))
            frame_idx += 1
    finally:
        cap.release()
        detector.close()

    if not track:
        track = [(0.0, 0.5), (probe.duration_s, 0.5)]
    return track


def _smooth_track(track: list[tuple[float, float]], window_s: float) -> list[tuple[float, float]]:
    """Moving-average smoothing in time-domain (±window_s/2 around each sample)."""
    if len(track) <= 1:
        return track
    half = window_s / 2
    smoothed: list[tuple[float, float]] = []
    for t, _ in track:
        xs = [x for tt, x in track if abs(tt - t) <= half]
        smoothed.append((t, sum(xs) / len(xs) if xs else 0.5))
    return smoothed


def _focus_x_at(track: list[tuple[float, float]], t: float) -> float:
    if not track:
        return 0.5
    if t <= track[0][0]:
        return track[0][1]
    if t >= track[-1][0]:
        return track[-1][1]
    for i in range(len(track) - 1):
        t0, x0 = track[i]
        t1, x1 = track[i + 1]
        if t0 <= t <= t1:
            if t1 == t0:
                return x0
            return x0 + (x1 - x0) * (t - t0) / (t1 - t0)
    return 0.5


# ─── Rendering ────────────────────────────────────────────────────────


def _render_vertical(
    *,
    src_mp4: str,
    out_mp4: str,
    probe: VideoProbe,
    focus_track: list[tuple[float, float]],
    captions: dict[str, Any] | None,
    handle: str,
    attribution_token: str | None,
) -> None:
    crop_w = min(probe.width, int(round(probe.height * 9 / 16)))
    crop_h = probe.height

    cap = cv2.VideoCapture(src_mp4)
    if not cap.isOpened():
        raise RuntimeError("OpenCV could not open source mp4 for render")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or probe.fps

    cap_font = ImageFont.truetype(FONT_PATH_BOLD, CAPTION_FONT_SIZE)
    badge_font = ImageFont.truetype(FONT_PATH_BOLD, BADGE_FONT_SIZE)

    badge_img = _build_badge(handle, badge_font) if handle else None
    word_segments = _flatten_caption_words(captions)

    ffmpeg_cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        # Raw BGR frames in over stdin.
        "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{TARGET_W}x{TARGET_H}",
        "-r", str(TARGET_FPS),
        "-i", "-",
        # Original source — we only want its audio stream.
        "-i", src_mp4,
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-c:v", "libx264",
        "-profile:v", "baseline", "-level", "4.0",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-b:v", "4500k", "-maxrate", "5000k", "-bufsize", "10000k",
        "-r", str(TARGET_FPS),
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        "-shortest",
    ]
    if attribution_token:
        ffmpeg_cmd += ["-metadata", f"clipt_attribution={attribution_token}"]
    ffmpeg_cmd.append(out_mp4)

    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None

    try:
        n_frames = int(math.ceil(probe.duration_s * TARGET_FPS))
        src_idx = 0
        current_src_frame = None
        for target_i in range(n_frames):
            t = target_i / TARGET_FPS
            needed_src_idx = int(t * src_fps)
            while src_idx <= needed_src_idx:
                ok, frame = cap.read()
                if not ok:
                    break
                current_src_frame = frame
                src_idx += 1
            if current_src_frame is None:
                break

            cropped = _crop_at(current_src_frame, focus_track, t, crop_w, crop_h, probe.width)
            resized = cv2.resize(cropped, (TARGET_W, TARGET_H), interpolation=cv2.INTER_AREA)
            pil_img = Image.fromarray(cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)).convert("RGBA")

            if word_segments:
                _burn_captions(pil_img, cap_font, word_segments, t)
            if badge_img is not None:
                pil_img.alpha_composite(
                    badge_img,
                    (TARGET_W - badge_img.width - BADGE_MARGIN, BADGE_MARGIN),
                )

            final = cv2.cvtColor(np.array(pil_img.convert("RGB")), cv2.COLOR_RGB2BGR)
            proc.stdin.write(final.tobytes())

        proc.stdin.close()
        stderr = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
        rc = proc.wait()
        if rc != 0:
            raise RuntimeError(f"ffmpeg encode failed (rc={rc}): {stderr[:500]}")
    finally:
        cap.release()
        try:
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except Exception:  # noqa: BLE001
            pass
        if proc.poll() is None:
            proc.terminate()


def _crop_at(
    frame: np.ndarray,
    focus_track: list[tuple[float, float]],
    t: float,
    crop_w: int,
    crop_h: int,
    src_w: int,
) -> np.ndarray:
    focus_x_norm = _focus_x_at(focus_track, t)
    focus_x_px = int(round(focus_x_norm * src_w))
    x0 = focus_x_px - crop_w // 2
    x0 = max(0, min(src_w - crop_w, x0))
    return frame[:crop_h, x0:x0 + crop_w]


# ─── Captions ─────────────────────────────────────────────────────────


def _flatten_caption_words(captions: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Flatten Whisper's segments→words tree into one timeline-ordered array.

    Each entry carries its source segment index so the renderer can find
    "all the words in the same segment as the active word" without
    re-walking the tree.
    """
    if not captions:
        return []
    segs = captions.get("segments") or []
    out: list[dict[str, Any]] = []
    for i, seg in enumerate(segs):
        words = seg.get("words") or []
        for w in words:
            text = (w.get("text") or "").strip()
            if not text:
                continue
            out.append({
                "start": float(w.get("start", 0)),
                "end": float(w.get("end", 0)),
                "text": text,
                "seg": i,
            })
    return out


def _burn_captions(
    pil_img: Image.Image,
    font: ImageFont.FreeTypeFont,
    word_segments: list[dict[str, Any]],
    t: float,
) -> None:
    """Draw the active segment's caption with the current word highlighted."""
    active_idx: int | None = None
    for i, w in enumerate(word_segments):
        if w["start"] <= t <= w["end"]:
            active_idx = i
            break
    if active_idx is None:
        # Brief carry: keep the last word visible for 0.4s after it ends
        # so the caption doesn't blink between words.
        for i, w in enumerate(word_segments):
            if w["start"] <= t and t - w["end"] < 0.4:
                active_idx = i
        if active_idx is None:
            return

    seg_id = word_segments[active_idx]["seg"]
    seg_words = [w for w in word_segments if w["seg"] == seg_id]
    if not seg_words:
        return

    draw = ImageDraw.Draw(pil_img)
    max_w = TARGET_W * CAPTION_MAX_WIDTH_RATIO
    lines = _wrap_words(seg_words, font, draw, max_w)
    line_h = font.getbbox("Hg")[3]
    block_h = len(lines) * line_h + max(0, len(lines) - 1) * CAPTION_LINE_GAP
    start_y = TARGET_H - CAPTION_BOTTOM_PAD - block_h

    active = word_segments[active_idx]
    for li, line in enumerate(lines):
        line_text = " ".join(w["text"] for w in line)
        line_w = draw.textlength(line_text, font=font)
        x = (TARGET_W - line_w) // 2
        y = start_y + li * (line_h + CAPTION_LINE_GAP)
        cursor = x
        for w in line:
            is_active = (
                w["start"] == active["start"]
                and w["end"] == active["end"]
                and w["text"] == active["text"]
            )
            color = ACCENT_HEX if is_active else TEXT_HEX
            draw.text(
                (cursor, y),
                w["text"],
                font=font,
                fill=color,
                stroke_width=CAPTION_STROKE_WIDTH,
                stroke_fill=STROKE_HEX,
            )
            cursor += draw.textlength(w["text"] + " ", font=font)


def _wrap_words(
    words: list[dict[str, Any]],
    font: ImageFont.FreeTypeFont,
    draw: ImageDraw.ImageDraw,
    max_w: float,
) -> list[list[dict[str, Any]]]:
    """Greedy word-wrap into lines of at most max_w pixels."""
    space_w = draw.textlength(" ", font=font)
    lines: list[list[dict[str, Any]]] = []
    cur: list[dict[str, Any]] = []
    cur_w = 0.0
    for w in words:
        tw = draw.textlength(w["text"], font=font)
        if cur and cur_w + space_w + tw > max_w:
            lines.append(cur)
            cur = [w]
            cur_w = tw
        else:
            cur.append(w)
            cur_w = cur_w + (space_w if len(cur) > 1 else 0) + tw
    if cur:
        lines.append(cur)
    return lines


# ─── Attribution badge ────────────────────────────────────────────────


def _build_badge(handle: str, font: ImageFont.FreeTypeFont) -> Image.Image:
    """Pill-shaped mint badge reading "@handle". Returns an RGBA image."""
    text = f"@{handle}"
    bbox = font.getbbox(text)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    badge_w = text_w + 2 * BADGE_PAD_X
    badge_h = text_h + 2 * BADGE_PAD_Y
    img = Image.new("RGBA", (badge_w, badge_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    mint = _hex_rgb(MINT_HEX)
    draw.rounded_rectangle(
        (0, 0, badge_w - 1, badge_h - 1),
        radius=badge_h // 2,
        fill=(*mint, 235),
    )
    # Dark text on light mint — better contrast than pure white.
    draw.text(
        (BADGE_PAD_X, BADGE_PAD_Y - bbox[1]),
        text,
        font=font,
        fill=(20, 20, 20, 255),
    )
    return img


def _hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _clean_handle(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lstrip("@")[:32]


# ─── Thumbnail ────────────────────────────────────────────────────────


def _extract_thumbnail(src_mp4: str, out_jpg: str) -> None:
    """Grab a single frame at 1.5s from the rendered vertical."""
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", "1.5", "-i", src_mp4, "-frames:v", "1", "-q:v", "3", out_jpg,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not os.path.exists(out_jpg):
        # Very short clips may not have a 1.5s frame — fall back to the
        # first one.
        cmd2 = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", src_mp4, "-frames:v", "1", "-q:v", "3", out_jpg,
        ]
        res2 = subprocess.run(cmd2, capture_output=True, text=True)
        if res2.returncode != 0:
            raise RuntimeError(f"thumbnail extract failed: {res2.stderr[:300]}")

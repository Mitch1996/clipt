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
#
# Short-range model expects faces within ~2m of the camera, which fails
# on streamer corner cams (face ≈ 300×300 px inside a 1920×1080 source =
# ~5% of the frame, looks "far" to short-range). Full-range catches
# these reliably.
_MODEL_PATH = "/tmp/clipt-models/face_detector.tflite"
_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/"
    "blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
)
# Detection input width — short-range works fine at 640, full-range
# (now used for small corner cams) likes 1280+ so face pixels stay
# discernible after downscaling.
_DETECT_INPUT_WIDTH = 1280
# Confidence floor. Lower than the previous 0.4 because tiny face cams
# tend to come back at 0.25–0.35 even when they're clearly the cam.
_MIN_DETECTION_CONFIDENCE = 0.25


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

# Stacked-layout band heights (sum must equal TARGET_H = 1920).
# Top band: face cam (head + shoulders crop), 48% of vertical.
# Middle band: caption strip on a dark backdrop, 15% of vertical.
# Bottom band: full gameplay frame letterboxed in 9:7-ish, 37%.
CAM_BAND_H = 920
CAPTION_BAND_H = 280
GAME_BAND_H = 720

# Brand colours. The design system (CLAUDE.md) pins the active-word
# highlight to electric currency-yellow and reserves mint for value-flow
# signals — the verified-attribution badge counts as one.
ACCENT_HEX = "#FFE600"
MINT_HEX = "#34D399"
STROKE_HEX = "#000000"
TEXT_HEX = "#FFFFFF"

# Bundled by `fonts-dejavu-core` in the Dockerfile.
FONT_PATH_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Stacked caption band: bigger font + tighter strokes since it has its
# own dedicated zone instead of being squeezed at the bottom of the
# frame.
CAPTION_FONT_SIZE = 78
CAPTION_LINE_GAP = 14
CAPTION_MAX_WIDTH_RATIO = 0.88
CAPTION_STROKE_WIDTH = 4
# Used only by the legacy `style="centered"` renderer.
CAPTION_BOTTOM_PAD = 220

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

        face_track = _sample_face_track(src_mp4, probe, SAMPLE_FPS)
        face_track = _smooth_face_track(face_track, SMOOTH_WINDOW_S)

        log.info("reframe: rendering 1080x1920 mp4 (style=%s)", payload.style)
        _render_vertical(
            src_mp4=src_mp4,
            out_mp4=out_mp4,
            probe=probe,
            face_track=face_track,
            style=payload.style or "stacked",
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
#
# Each sample is (t, x, y, w, h) with all bbox values normalized 0..1 of
# the source dimensions. x,y is the face *center*. When no face is
# detected we hold the last known sample so the focus doesn't bounce
# back to (0.5, 0.5) on a 1-frame miss; the very first frames before
# any detection use a sensible default that puts the cam crop on a
# centred head-and-shoulders sized region.
#
# `FaceSample` is a plain tuple to stay lightweight (5 fps × 60 s of
# clip = 300 samples, dataclass overhead would multiply that).

FaceSample = tuple[float, float, float, float, float]
# (t_seconds, x_center_norm, y_center_norm, w_norm, h_norm)

# Default face for the very-first frames before any detection lands or
# the entire clip has no detectable face. Centred, ~30% of source
# height/width — a reasonable "talking head" assumption.
DEFAULT_FACE: tuple[float, float, float, float] = (0.5, 0.45, 0.22, 0.30)


def _sample_face_track(
    src_mp4: str, probe: VideoProbe, sample_fps: int,
) -> list[FaceSample]:
    """Sample the source at `sample_fps` and detect the largest face
    in each sampled frame. Returns time-ordered FaceSamples; when no
    face is detected for a sample we carry forward the last known.
    """
    options = mp_vision.FaceDetectorOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=_ensure_face_model()),
        running_mode=mp_vision.RunningMode.IMAGE,
        min_detection_confidence=_MIN_DETECTION_CONFIDENCE,
    )
    detector = mp_vision.FaceDetector.create_from_options(options)

    cap = cv2.VideoCapture(src_mp4)
    if not cap.isOpened():
        raise RuntimeError("OpenCV could not open source mp4")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or probe.fps
    stride = max(1, int(round(src_fps / sample_fps)))

    track: list[FaceSample] = []
    frame_idx = 0
    last_face: tuple[float, float, float, float] = DEFAULT_FACE
    detections_count = 0
    try:
        while True:
            ok = cap.grab()
            if not ok:
                break
            if frame_idx % stride == 0:
                ok, frame = cap.retrieve()
                if not ok:
                    break
                # Higher detection resolution so corner face cams (often
                # only 250–350 px in a 1920×1080 frame) keep enough
                # pixels for the Blaze model. ~2× more compute than the
                # 640 default but still well within the per-frame budget.
                h, w = frame.shape[:2]
                if w > _DETECT_INPUT_WIDTH:
                    scale = _DETECT_INPUT_WIDTH / w
                    small = cv2.resize(
                        frame,
                        (int(w * scale), int(h * scale)),
                        interpolation=cv2.INTER_AREA,
                    )
                else:
                    small = frame
                rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = detector.detect(mp_img)
                t = frame_idx / max(src_fps, 1.0)
                if result.detections:
                    sw, sh = small.shape[1], small.shape[0]
                    # Reject detections that are absurdly tiny (false
                    # positives on game UI elements) or > 60% of source
                    # (probably an actual game character / banner, not
                    # the streamer's cam).
                    candidates = [
                        d for d in result.detections
                        if 0.01 < (d.bounding_box.width / max(sw, 1)) < 0.6
                        and 0.01 < (d.bounding_box.height / max(sh, 1)) < 0.6
                    ]
                    if candidates:
                        # Score = bbox area × corner-position weight.
                        # Streamer face cams are essentially always in a
                        # corner of the OBS layout; central detections
                        # are usually false positives (game characters,
                        # torch handles, banners). Weighting lets a
                        # smaller-but-cornered detection beat a larger
                        # central false positive without rejecting the
                        # "talking head" case outright.
                        def _score(d):
                            bb = d.bounding_box
                            cx = (bb.origin_x + bb.width / 2) / max(sw, 1)
                            cy = (bb.origin_y + bb.height / 2) / max(sh, 1)
                            edge_dist = min(cx, 1 - cx, cy, 1 - cy)
                            if edge_dist < 0.15:
                                w = 8.0  # tight against an edge — almost certainly real cam
                            elif edge_dist < 0.25:
                                w = 3.0  # corner-ish
                            elif edge_dist > 0.35:
                                w = 0.2  # squarely central — heavily penalise
                            else:
                                w = 1.0
                            return w * bb.width * bb.height

                        best = max(candidates, key=_score)
                        bb = best.bounding_box
                        cx = (bb.origin_x + bb.width / 2) / max(sw, 1)
                        cy = (bb.origin_y + bb.height / 2) / max(sh, 1)
                        bw = bb.width / max(sw, 1)
                        bh = bb.height / max(sh, 1)
                        last_face = (
                            max(0.0, min(1.0, cx)),
                            max(0.0, min(1.0, cy)),
                            max(0.0, min(1.0, bw)),
                            max(0.0, min(1.0, bh)),
                        )
                        detections_count += 1
                track.append((t, *last_face))
            frame_idx += 1
    finally:
        cap.release()
        detector.close()

    # Dominant face location across the clip — useful when the bbox
    # tracks consistently to one corner (likely a face cam) vs.
    # bouncing around (likely false positives the corner-preference
    # weighting still couldn't fully suppress).
    if track:
        avg_x = sum(s[1] for s in track) / len(track)
        avg_y = sum(s[2] for s in track) / len(track)
        avg_w = sum(s[3] for s in track) / len(track)
        log.info(
            "reframe: face track sampled %d frames, %d detections, "
            "avg center=(%.2f, %.2f) avg_w=%.2f",
            len(track), detections_count, avg_x, avg_y, avg_w,
        )
    else:
        log.info("reframe: face track empty — using DEFAULT_FACE")

    if not track:
        track = [(0.0, *DEFAULT_FACE), (probe.duration_s, *DEFAULT_FACE)]
    return track


def _smooth_face_track(
    track: list[FaceSample], window_s: float,
) -> list[FaceSample]:
    """Moving-average smoothing in time-domain over all four bbox
    components. Keeps the cam crop from snapping between samples."""
    if len(track) <= 1:
        return track
    half = window_s / 2
    smoothed: list[FaceSample] = []
    for sample in track:
        t = sample[0]
        nearby = [s for s in track if abs(s[0] - t) <= half]
        n = len(nearby)
        if n == 0:
            smoothed.append(sample)
            continue
        x = sum(s[1] for s in nearby) / n
        y = sum(s[2] for s in nearby) / n
        w = sum(s[3] for s in nearby) / n
        h = sum(s[4] for s in nearby) / n
        smoothed.append((t, x, y, w, h))
    return smoothed


def _face_at(track: list[FaceSample], t: float) -> tuple[float, float, float, float]:
    """Linearly interpolate the face bbox at any time t. Returns
    (x_center, y_center, w, h) all normalized 0..1."""
    if not track:
        return DEFAULT_FACE
    if t <= track[0][0]:
        return track[0][1:5]  # type: ignore[return-value]
    if t >= track[-1][0]:
        return track[-1][1:5]  # type: ignore[return-value]
    for i in range(len(track) - 1):
        t0 = track[i][0]
        t1 = track[i + 1][0]
        if t0 <= t <= t1:
            if t1 == t0:
                return track[i][1:5]  # type: ignore[return-value]
            r = (t - t0) / (t1 - t0)
            return (
                track[i][1] + (track[i + 1][1] - track[i][1]) * r,
                track[i][2] + (track[i + 1][2] - track[i][2]) * r,
                track[i][3] + (track[i + 1][3] - track[i][3]) * r,
                track[i][4] + (track[i + 1][4] - track[i][4]) * r,
            )
    return DEFAULT_FACE


# Legacy single-axis helpers kept for the `style="centered"` fallback
# path that wraps the bbox track to look like the old (t, x) format.

def _focus_x_at(track: list[FaceSample], t: float) -> float:
    return _face_at(track, t)[0]


# ─── Rendering ────────────────────────────────────────────────────────


def _render_vertical(
    *,
    src_mp4: str,
    out_mp4: str,
    probe: VideoProbe,
    face_track: list[FaceSample],
    style: str,
    captions: dict[str, Any] | None,
    handle: str,
    attribution_token: str | None,
) -> None:
    # Treat both `default` (legacy callers) and `stacked` as the
    # face-cam-top + caption-mid + gameplay-bottom layout. The old
    # full-frame centred crop is `centered` and stays available as an
    # opt-in fallback.
    is_stacked = style in ("stacked", "default", "", None)

    # Centered-only: full-frame 9:16 column.
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

            if is_stacked:
                composed = _compose_stacked_frame(
                    current_src_frame, face_track, t, probe.width, probe.height,
                )
            else:
                cropped = _crop_at(current_src_frame, face_track, t, crop_w, crop_h, probe.width)
                composed = cv2.resize(cropped, (TARGET_W, TARGET_H), interpolation=cv2.INTER_AREA)

            pil_img = Image.fromarray(cv2.cvtColor(composed, cv2.COLOR_BGR2RGB)).convert("RGBA")

            if word_segments:
                if is_stacked:
                    # Centre captions inside the dedicated middle band.
                    _burn_captions(
                        pil_img, cap_font, word_segments, t,
                        band_y_start=CAM_BAND_H,
                        band_y_end=CAM_BAND_H + CAPTION_BAND_H,
                    )
                else:
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
    face_track: list[FaceSample],
    t: float,
    crop_w: int,
    crop_h: int,
    src_w: int,
) -> np.ndarray:
    """Legacy centred 9:16 column crop. Kept for style='centered'."""
    focus_x_norm = _focus_x_at(face_track, t)
    focus_x_px = int(round(focus_x_norm * src_w))
    x0 = focus_x_px - crop_w // 2
    x0 = max(0, min(src_w - crop_w, x0))
    return frame[:crop_h, x0:x0 + crop_w]


# ─── Stacked-layout composer ──────────────────────────────────────────


def _cam_crop_box(
    face_x: float, face_y: float, face_w: float, face_h: float,
    src_w: int, src_h: int, target_aspect: float,
) -> tuple[int, int, int, int]:
    """Return (x0, y0, w, h) of the source-pixel region to use as the
    cam crop. Expands the face bbox to include head padding + shoulders,
    then squares to the band's aspect ratio, clamps to source bounds,
    and biases the centre downward so chest sits in-frame too."""
    face_px_w = face_w * src_w
    face_px_h = face_h * src_h
    face_px_x = face_x * src_w
    face_px_y = face_y * src_h

    # Desired crop: head padding above + face + shoulders + arms below
    # + side padding. Larger multiplier than a head-and-shoulders portrait
    # to give corner face cams enough surrounding context that the band
    # doesn't look like a face filling the whole upper half of the clip.
    crop_h_target = face_px_h * 4.5
    crop_w_target = face_px_w * 4.0

    # Snap to the cam band's aspect ratio.
    if crop_w_target / max(crop_h_target, 1.0) < target_aspect:
        crop_w_target = crop_h_target * target_aspect
    else:
        crop_h_target = crop_w_target / target_aspect

    # Clamp to source — at the source bounds, snap dims so aspect stays
    # right (otherwise we'd letterbox after resize and the cam would
    # have black bars).
    if crop_h_target > src_h:
        crop_h_target = src_h
        crop_w_target = crop_h_target * target_aspect
    if crop_w_target > src_w:
        crop_w_target = src_w
        crop_h_target = crop_w_target / target_aspect

    # Centre on face but bias the crop downward by ~40% of face height
    # so the chest fits — without this the streamer floats at the
    # vertical midpoint of the band with their forehead nearly touching
    # the top edge.
    cy = face_px_y + face_px_h * 0.4

    crop_w_i = max(2, int(round(crop_w_target)))
    crop_h_i = max(2, int(round(crop_h_target)))
    x0 = int(round(face_px_x - crop_w_i / 2))
    y0 = int(round(cy - crop_h_i / 2))
    x0 = max(0, min(src_w - crop_w_i, x0))
    y0 = max(0, min(src_h - crop_h_i, y0))
    return (x0, y0, crop_w_i, crop_h_i)


# Caption band backdrop colour — slightly lighter than pure black so
# the box reads as a distinct strip against any cam / gameplay frame.
_CAPTION_BAND_BG = (14, 14, 14)


def _compose_stacked_frame(
    frame: np.ndarray,
    face_track: list[FaceSample],
    t: float,
    src_w: int,
    src_h: int,
) -> np.ndarray:
    """Build one 1080×1920 stacked frame from a source frame + the
    face-track sample at time t."""
    out = np.empty((TARGET_H, TARGET_W, 3), dtype=np.uint8)

    # ── Cam band (top): head + shoulders crop ─────────────────────────
    face_x, face_y, face_w, face_h = _face_at(face_track, t)
    cam_aspect = TARGET_W / CAM_BAND_H
    cx0, cy0, ccw, cch = _cam_crop_box(
        face_x, face_y, face_w, face_h, src_w, src_h, cam_aspect,
    )
    cam_crop = frame[cy0:cy0 + cch, cx0:cx0 + ccw]
    out[0:CAM_BAND_H] = cv2.resize(
        cam_crop, (TARGET_W, CAM_BAND_H), interpolation=cv2.INTER_AREA,
    )

    # ── Caption band (middle): solid backdrop, text drawn later by PIL ─
    out[CAM_BAND_H:CAM_BAND_H + CAPTION_BAND_H] = _CAPTION_BAND_BG

    # ── Gameplay band (bottom): full source letterboxed into 1080×720 ─
    game_zone_top = CAM_BAND_H + CAPTION_BAND_H
    out[game_zone_top:] = _CAPTION_BAND_BG  # backdrop for letterbox

    src_aspect = src_w / max(src_h, 1)
    band_aspect = TARGET_W / GAME_BAND_H
    if src_aspect > band_aspect:
        # Source wider than the band aspect → fit width.
        new_w = TARGET_W
        new_h = max(1, int(round(TARGET_W / src_aspect)))
    else:
        new_h = GAME_BAND_H
        new_w = max(1, int(round(GAME_BAND_H * src_aspect)))
    game_resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    y_off = game_zone_top + (GAME_BAND_H - new_h) // 2
    x_off = (TARGET_W - new_w) // 2
    out[y_off:y_off + new_h, x_off:x_off + new_w] = game_resized

    return out


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
    band_y_start: int | None = None,
    band_y_end: int | None = None,
) -> None:
    """Draw the active segment's caption with the current word
    highlighted. When `band_y_start/end` is provided, the caption block
    is vertically centred inside that band (stacked layout). Otherwise
    it sits at the legacy bottom-third anchor."""
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

    if band_y_start is not None and band_y_end is not None:
        band_h = band_y_end - band_y_start
        start_y = band_y_start + max(0, (band_h - block_h) // 2)
    else:
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

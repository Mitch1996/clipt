"""Production job endpoints.

POST /jobs/stitch-live-window
  Called by the Next-side `liveHypeMoment` Inngest function when the
  spike detector fires. Lists every `live/{channelId}/*.ts` segment
  whose embedded ms-epoch timestamp falls inside the requested window,
  ffmpeg-concats them into `sources/{newClipId}.mp4`, and returns the
  S3 key + duration so the caller can insert a clip row and trigger
  the normal processing pipeline (transcribe + reframe + sign).

  Auth: HMAC-JWT with audience `clipt-live-worker` (see app/auth.py).
  The /dev/* probe endpoints use a separate DEV_PROBE_TOKEN guard.
"""
from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path

import boto3
from botocore.client import Config as BotoConfig
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import verify_bearer
from .config import settings

log = logging.getLogger(__name__)

router = APIRouter()


class StitchLiveWindowIn(BaseModel):
    channel_id: str = Field(alias="channelId")
    channel_login: str | None = Field(default=None, alias="channelLogin")
    window_start_ms: int = Field(alias="windowStartMs")
    window_end_ms: int = Field(alias="windowEndMs")
    new_clip_id: str = Field(alias="newClipId")

    model_config = {"populate_by_name": True}


class StitchLiveWindowOut(BaseModel):
    source_r2_key: str = Field(alias="sourceR2Key")
    duration_sec: float = Field(alias="durationSec")
    segment_count: int = Field(alias="segmentCount")
    bytes_total: int = Field(alias="bytesTotal")

    model_config = {"populate_by_name": True}


def _s3_client():
    s = settings()
    kwargs: dict = {
        "aws_access_key_id": s.storage_access_key_id,
        "aws_secret_access_key": s.storage_secret_access_key,
        "region_name": s.storage_region,
        "config": BotoConfig(signature_version="s3v4"),
    }
    if s.storage_endpoint_url:
        kwargs["endpoint_url"] = s.storage_endpoint_url
    return boto3.client("s3", **kwargs)


_TS_KEY_RE = re.compile(r"^live/[^/]+/(?P<ms>\d+)\.ts$")


@router.post(
    "/jobs/stitch-live-window",
    response_model=StitchLiveWindowOut,
)
def stitch_live_window(
    payload: StitchLiveWindowIn,
    _claims: dict = Depends(verify_bearer),
) -> StitchLiveWindowOut:
    cfg = settings()
    s3 = _s3_client()

    prefix = f"live/{payload.channel_id}/"
    # The ingestor's keys are ms-since-epoch (15-digit zero-padded).
    # We list everything under the prefix and filter in Python because
    # S3 listings are alphabetic; with 15-digit padding alphabetic ==
    # numeric ordering, so a future optimisation could use
    # StartAfter / Prefix tricks.
    objs: list[dict] = []
    continuation: str | None = None
    while True:
        kwargs: dict = {"Bucket": cfg.storage_bucket, "Prefix": prefix, "MaxKeys": 1000}
        if continuation:
            kwargs["ContinuationToken"] = continuation
        res = s3.list_objects_v2(**kwargs)
        objs.extend(res.get("Contents") or [])
        if not res.get("IsTruncated"):
            break
        continuation = res.get("NextContinuationToken")

    in_window: list[tuple[int, str]] = []
    for obj in objs:
        key = obj["Key"]
        m = _TS_KEY_RE.match(key)
        if not m:
            continue
        ts_ms = int(m.group("ms"))
        if payload.window_start_ms <= ts_ms <= payload.window_end_ms:
            in_window.append((ts_ms, key))
    in_window.sort()

    if not in_window:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No .ts segments under {prefix} in window "
                f"[{payload.window_start_ms}, {payload.window_end_ms}]. "
                "Buffer may have already been pruned, or the channel "
                "stopped producing segments before the window closed."
            ),
        )

    workdir = Path(tempfile.mkdtemp(prefix=f"stitch-{payload.new_clip_id[:8]}-"))
    try:
        bytes_total = 0
        local_paths: list[Path] = []
        for i, (_, key) in enumerate(in_window):
            local = workdir / f"seg-{i:05d}.ts"
            res = s3.get_object(Bucket=cfg.storage_bucket, Key=key)
            data = res["Body"].read()
            local.write_bytes(data)
            local_paths.append(local)
            bytes_total += len(data)

        list_path = workdir / "list.txt"
        list_path.write_text("\n".join(f"file '{p.as_posix()}'" for p in local_paths))

        out_path = workdir / "out.mp4"
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(list_path),
            "-c", "copy",
            "-bsf:a", "aac_adtstoasc",
            str(out_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"ffmpeg concat failed: {result.stderr[:500]}",
            )

        # Probe duration. ffprobe is bundled with ffmpeg.
        probe = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(out_path),
            ],
            capture_output=True, text=True,
        )
        duration_sec = float(probe.stdout.strip() or 0)

        source_key = f"sources/{payload.new_clip_id}.mp4"
        with open(out_path, "rb") as f:
            s3.put_object(
                Bucket=cfg.storage_bucket,
                Key=source_key,
                Body=f.read(),
                ContentType="video/mp4",
            )

        log.info(
            "stitch-live-window[%s]: %d segments, %.2f s, %d bytes → %s",
            payload.new_clip_id[:8],
            len(in_window), duration_sec, bytes_total, source_key,
        )
        return StitchLiveWindowOut(
            sourceR2Key=source_key,
            durationSec=duration_sec,
            segmentCount=len(in_window),
            bytesTotal=bytes_total,
        )
    finally:
        for p in workdir.iterdir():
            try:
                p.unlink()
            except Exception:  # noqa: BLE001
                pass
        try:
            workdir.rmdir()
        except Exception:  # noqa: BLE001
            pass

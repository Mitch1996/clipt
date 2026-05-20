"""Dev-only probe + stitch endpoints.

POST /dev/probe-channel { "login": "xqc", "keep_artifacts": true }
  Spins up an ingestor against any Twitch login for up to 60s. If
  keep_artifacts=true, the captured .ts segments stay in S3 after the
  run so a follow-up stitch call can assemble them.

POST /dev/stitch-probe { "channel_id": "probe-xqc-1779..." }
  Lists every live/<channel_id>/*.ts under the bucket, ffmpeg-concats
  them into a single .mp4, uploads to live/<channel_id>/_assembled.mp4,
  returns a 1h signed URL the developer can click to view the capture.

Both endpoints are gated by a shared bearer token (DEV_PROBE_TOKEN).
Returns 503 if the token isn't configured on the worker.
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import boto3
import httpx
from botocore.client import Config as BotoConfig
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from .config import settings
from .ingestor import run_ingestor
from .inngest_send import send_event
from .metrics import CHAT_MESSAGES, HYPE_MOMENTS_FIRED
from .redis_helper import UpstashClient
from .spike_detector import SpikeDetector
from .twitch_chat import TwitchChatListener

log = logging.getLogger(__name__)

router = APIRouter()


def _auth(authorization: str | None) -> None:
    expected = os.environ.get("DEV_PROBE_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Probe endpoint not configured")
    if not authorization or authorization.removeprefix("Bearer ").strip() != expected:
        raise HTTPException(status_code=401, detail="Bad probe token")


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


# ─── Probe ───────────────────────────────────────────────────────────


class ProbeRequest(BaseModel):
    login: str
    duration_s: float = 60.0
    keep_artifacts: bool = False
    # Whether to also start a chat listener + spike detector against the
    # same login for the duration. Default true so the dev probe
    # exercises both the ingestor and the spike pipeline.
    with_chat: bool = True


class ProbeResponse(BaseModel):
    task_id: str
    channel_id: str
    login: str
    duration_s: float
    keep_artifacts: bool
    with_chat: bool


@router.post("/dev/probe-channel", response_model=ProbeResponse)
async def probe_channel(
    payload: ProbeRequest,
    authorization: str | None = Header(default=None),
) -> ProbeResponse:
    _auth(authorization)

    synthetic_channel_id = f"probe-{payload.login}-{int(time.time())}"
    task_id = uuid.uuid4().hex
    cancel = asyncio.Event()
    http = httpx.AsyncClient(timeout=10.0)
    redis = UpstashClient()

    # Optional chat listener + spike detector. Same task lifetime as
    # the ingestor.
    chat_listener: TwitchChatListener | None = None
    chat_detector: SpikeDetector | None = None
    if payload.with_chat:
        async def on_hype(_cid: str, reason: str, hpayload: dict) -> None:
            HYPE_MOMENTS_FIRED.labels(reason=reason).inc()
            await send_event(name="clip/hype-moment", data=hpayload)

        chat_detector = SpikeDetector(
            channel_id=synthetic_channel_id,
            channel_login=payload.login,
            on_hype=on_hype,
        )

        async def on_message(channel: str, nick: str, text: str, ts: float) -> None:
            CHAT_MESSAGES.inc()
            assert chat_detector is not None
            await chat_detector.on_message(channel, nick, text, ts)

        chat_listener = TwitchChatListener(
            channel_login=payload.login, on_message=on_message
        )

    async def _run():
        chat_listener_task: asyncio.Task[None] | None = None
        chat_detector_task: asyncio.Task[None] | None = None
        if chat_listener and chat_detector:
            chat_listener_task = asyncio.create_task(
                chat_listener.run(), name=f"probe-chat-{payload.login}"
            )
            chat_detector_task = asyncio.create_task(
                chat_detector.run(), name=f"probe-spike-{payload.login}"
            )
        try:
            await asyncio.wait_for(
                run_ingestor(
                    channel_id=synthetic_channel_id,
                    twitch_login=payload.login,
                    http=http,
                    redis=redis,
                    cancel_event=cancel,
                    keep_artifacts=payload.keep_artifacts,
                ),
                timeout=payload.duration_s,
            )
        except asyncio.TimeoutError:
            cancel.set()
            log.info("probe[%s]: hit %.0fs duration cap", payload.login, payload.duration_s)
        finally:
            if chat_listener:
                chat_listener.stop()
            if chat_detector:
                chat_detector.stop()
            for task in (chat_listener_task, chat_detector_task):
                if task:
                    try:
                        await asyncio.wait_for(task, timeout=5.0)
                    except (asyncio.TimeoutError, asyncio.CancelledError):
                        task.cancel()
            await http.aclose()
            await redis.aclose()

    asyncio.create_task(_run(), name=f"probe-{payload.login}-{task_id[:6]}")
    log.info(
        "probe[%s]: started task %s channel=%s duration=%.0fs keep=%s chat=%s",
        payload.login, task_id[:8], synthetic_channel_id,
        payload.duration_s, payload.keep_artifacts, payload.with_chat,
    )
    return ProbeResponse(
        task_id=task_id,
        channel_id=synthetic_channel_id,
        login=payload.login,
        duration_s=payload.duration_s,
        keep_artifacts=payload.keep_artifacts,
        with_chat=payload.with_chat,
    )


# ─── Stitch ──────────────────────────────────────────────────────────


class StitchRequest(BaseModel):
    channel_id: str


class StitchResponse(BaseModel):
    mp4_key: str
    signed_url: str
    segment_count: int
    bytes_total: int


@router.post("/dev/stitch-probe", response_model=StitchResponse)
def stitch_probe(
    payload: StitchRequest,
    authorization: str | None = Header(default=None),
) -> StitchResponse:
    _auth(authorization)

    cfg = settings()
    s3 = _s3_client()
    prefix = f"live/{payload.channel_id}/"
    res = s3.list_objects_v2(Bucket=cfg.storage_bucket, Prefix=prefix, MaxKeys=1000)
    objs = res.get("Contents") or []
    # Skip any previously-assembled mp4 + only stitch the .ts segments.
    ts_keys = sorted(o["Key"] for o in objs if o["Key"].endswith(".ts"))
    if not ts_keys:
        raise HTTPException(
            status_code=404,
            detail=f"No .ts segments under {prefix} — was the probe run with keep_artifacts=true?",
        )

    workdir = Path(tempfile.mkdtemp(prefix=f"stitch-{payload.channel_id[:16]}-"))
    try:
        # Download each segment locally.
        local_paths: list[Path] = []
        bytes_total = 0
        for i, key in enumerate(ts_keys):
            local = workdir / f"seg-{i:05d}.ts"
            res = s3.get_object(Bucket=cfg.storage_bucket, Key=key)
            data = res["Body"].read()
            local.write_bytes(data)
            local_paths.append(local)
            bytes_total += len(data)

        # ffmpeg concat list.
        list_path = workdir / "list.txt"
        list_path.write_text("\n".join(f"file '{p.as_posix()}'" for p in local_paths))

        out_path = workdir / "out.mp4"
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-c",
            "copy",
            "-bsf:a",
            "aac_adtstoasc",
            str(out_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"ffmpeg concat failed: {result.stderr[:500]}",
            )

        mp4_key = f"{prefix}_assembled.mp4"
        with open(out_path, "rb") as f:
            s3.put_object(
                Bucket=cfg.storage_bucket,
                Key=mp4_key,
                Body=f.read(),
                ContentType="video/mp4",
            )

        signed = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": cfg.storage_bucket, "Key": mp4_key},
            ExpiresIn=3600,
        )
        return StitchResponse(
            mp4_key=mp4_key,
            signed_url=signed,
            segment_count=len(ts_keys),
            bytes_total=bytes_total,
        )
    finally:
        # Tear down the local tmpdir.
        for p in workdir.iterdir():
            try:
                p.unlink()
            except Exception:  # noqa: BLE001
                pass
        try:
            workdir.rmdir()
        except Exception:  # noqa: BLE001
            pass

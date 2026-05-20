"""Dev-only probe endpoint.

POST /dev/probe-channel { "login": "xqc" }

Lets us spin up an ingestor against any currently-live Twitch login
for 60s — without that login needing to be a connected Clipt channel.
Useful when you (the developer) aren't a streamer yourself but want
to verify the segment-capture path end-to-end against a popular stream.

Gated by a shared bearer token (`DEV_PROBE_TOKEN`). Returns immediately
with the task id; the ingestor runs in the background and writes
segments to `live/probe-{login}-{ts}/...ts`. Self-stops after 60s OR
on idle (whichever comes first).
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from .ingestor import run_ingestor
from .redis_helper import UpstashClient

log = logging.getLogger(__name__)

router = APIRouter()


class ProbeRequest(BaseModel):
    login: str
    duration_s: float = 60.0


class ProbeResponse(BaseModel):
    task_id: str
    channel_id: str  # The synthetic key under which segments land in S3.
    login: str
    duration_s: float


@router.post("/dev/probe-channel", response_model=ProbeResponse)
async def probe_channel(
    payload: ProbeRequest,
    authorization: str | None = Header(default=None),
) -> ProbeResponse:
    expected = os.environ.get("DEV_PROBE_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Probe endpoint not configured")
    if not authorization or authorization.removeprefix("Bearer ").strip() != expected:
        raise HTTPException(status_code=401, detail="Bad probe token")

    # Synthetic "channel id" so the smoke writes land in a separate
    # prefix from real channel ingestors. Format: probe-{login}-{epoch}.
    synthetic_channel_id = f"probe-{payload.login}-{int(time.time())}"

    task_id = uuid.uuid4().hex
    cancel = asyncio.Event()
    http = httpx.AsyncClient(timeout=10.0)
    redis = UpstashClient()

    async def _run():
        try:
            await asyncio.wait_for(
                run_ingestor(
                    channel_id=synthetic_channel_id,
                    twitch_login=payload.login,
                    http=http,
                    redis=redis,
                    cancel_event=cancel,
                ),
                timeout=payload.duration_s,
            )
        except asyncio.TimeoutError:
            cancel.set()
            log.info("probe[%s]: hit %.0fs duration cap", payload.login, payload.duration_s)
        finally:
            await http.aclose()
            await redis.aclose()

    asyncio.create_task(_run(), name=f"probe-{payload.login}-{task_id[:6]}")
    log.info(
        "probe[%s]: started task %s (channel=%s, duration=%.0fs)",
        payload.login, task_id[:8], synthetic_channel_id, payload.duration_s,
    )
    return ProbeResponse(
        task_id=task_id,
        channel_id=synthetic_channel_id,
        login=payload.login,
        duration_s=payload.duration_s,
    )

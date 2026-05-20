"""Thin wrapper around Inngest's HTTP ingestion endpoint.

The Next side instantiates the Inngest client and listens for events
on /api/inngest. From the live worker we can't reach the Next client
directly, but Inngest's public ingest URL accepts events from any
language:

  POST https://inn.gs/e/<INNGEST_EVENT_KEY>
  Body: { "name": "clip/hype-moment", "data": {...} }

That's the same wire shape `inngest.send` uses under the hood. We
prefer this over POSTing to a Next-side /api endpoint so the live
worker doesn't depend on the web app being online.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)

_INGEST_BASE = "https://inn.gs/e/"


async def send_event(
    *,
    name: str,
    data: dict[str, Any],
    client: httpx.AsyncClient | None = None,
) -> None:
    """Fire-and-best-effort send. Logs but doesn't raise on failure —
    a missed hype-moment is preferable to a crashed chat task."""
    event_key = os.environ.get("INNGEST_EVENT_KEY")
    if not event_key:
        log.warning("inngest_send: INNGEST_EVENT_KEY not set — dropping %s", name)
        return
    url = f"{_INGEST_BASE}{event_key}"
    payload = {"name": name, "data": data}
    owns_client = client is None
    c = client or httpx.AsyncClient(timeout=5.0)
    try:
        res = await c.post(url, json=payload)
        if res.status_code >= 400:
            log.warning(
                "inngest_send: %s -> %s %s",
                name, res.status_code, res.text[:200],
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("inngest_send: %s failed %s", name, exc)
    finally:
        if owns_client:
            await c.aclose()

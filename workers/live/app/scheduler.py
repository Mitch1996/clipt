"""Top-level scheduler.

Runs continuously in the live worker's asyncio loop. Every
`poll_interval_s` seconds:
  1. Read connected Twitch channels from Supabase.
  2. Hit /helix/streams to find which are currently live.
  3. Diff against the currently-running ingestor tasks:
     - Newly-live channels → spawn an ingestor task.
     - Channels that went offline → set their cancel_event so the
       ingestor wraps up cleanly.
  4. Stamp `channels.is_live` + `last_live_check` + `last_live_at`.

V1 is Twitch-only. YouTube + Kick parity lands in 2.x.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from supabase import Client, create_client

from .config import settings
from .ingestor import IngestorRunResult, run_ingestor
from .metrics import ACTIVE_INGESTORS
from .redis_helper import UpstashClient
from .twitch_live import stream_status

log = logging.getLogger(__name__)


@dataclass
class _RunningTask:
    task: asyncio.Task[IngestorRunResult]
    cancel: asyncio.Event = field(default_factory=asyncio.Event)


def _supabase() -> Client:
    s = settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


class Scheduler:
    def __init__(self) -> None:
        self._http: httpx.AsyncClient | None = None
        self._redis: UpstashClient | None = None
        self._tasks: dict[str, _RunningTask] = {}
        self._stop_event = asyncio.Event()
        self._supabase = _supabase()

    async def start(self) -> None:
        self._http = httpx.AsyncClient(timeout=10.0)
        self._redis = UpstashClient()
        asyncio.create_task(self._run_forever(), name="scheduler-loop")
        log.info("scheduler: started")

    async def stop(self) -> None:
        self._stop_event.set()
        # Tell all ingestors to wrap up.
        for rt in self._tasks.values():
            rt.cancel.set()
        await asyncio.gather(
            *(rt.task for rt in self._tasks.values()),
            return_exceptions=True,
        )
        if self._http:
            await self._http.aclose()
        if self._redis:
            await self._redis.aclose()
        log.info("scheduler: stopped")

    async def _run_forever(self) -> None:
        try:
            while not self._stop_event.is_set():
                try:
                    await self._tick()
                except Exception as exc:  # noqa: BLE001
                    log.exception("scheduler tick failed: %s", exc)
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(),
                        timeout=settings().poll_interval_s,
                    )
                    return
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            return

    async def _tick(self) -> None:
        assert self._http is not None
        assert self._redis is not None

        # Pull connected Twitch channels. RLS bypass via service role.
        res = (
            self._supabase.table("channels")
            .select("id, platform, platform_username, access_token_encrypted")
            .eq("platform", "twitch")
            .not_.is_("access_token_encrypted", "null")
            .execute()
        )
        rows = res.data or []
        log.debug("scheduler tick: %d connected twitch channels", len(rows))

        # Reap finished tasks so the dict reflects truth before diffing.
        for channel_id in list(self._tasks):
            rt = self._tasks[channel_id]
            if rt.task.done():
                self._tasks.pop(channel_id)
                ACTIVE_INGESTORS.dec()

        for row in rows:
            channel_id = row["id"]
            login = row.get("platform_username")
            if not login:
                continue
            try:
                status = await stream_status(login, self._http)
            except Exception as exc:  # noqa: BLE001
                log.warning("scheduler: stream_status %s failed: %s", login, exc)
                continue

            now_iso = datetime.now(timezone.utc).isoformat()
            update: dict[str, object] = {
                "is_live": status.is_live,
                "last_live_check": now_iso,
            }
            if status.is_live:
                update["last_live_at"] = now_iso
            try:
                self._supabase.table("channels").update(update).eq(
                    "id", channel_id
                ).execute()
            except Exception as exc:  # noqa: BLE001
                log.warning("scheduler: channel update failed for %s: %s", channel_id, exc)

            running = self._tasks.get(channel_id)
            if status.is_live and not running:
                cancel_event = asyncio.Event()
                task = asyncio.create_task(
                    run_ingestor(
                        channel_id=channel_id,
                        twitch_login=login,
                        http=self._http,
                        redis=self._redis,
                        cancel_event=cancel_event,
                    ),
                    name=f"ingestor-{channel_id[:8]}",
                )
                self._tasks[channel_id] = _RunningTask(task=task, cancel=cancel_event)
                ACTIVE_INGESTORS.inc()
                log.info("scheduler: started ingestor for %s (%s)", login, channel_id[:8])
            elif not status.is_live and running:
                running.cancel.set()
                # The task removes itself on next tick via the reap loop.


_scheduler: Scheduler | None = None


def scheduler() -> Scheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = Scheduler()
    return _scheduler

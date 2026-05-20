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

from .audio_energy import AudioEnergyDetector
from .config import settings
from .ingestor import IngestorRunResult, run_ingestor
from .inngest_send import send_event
from .metrics import (
    ACTIVE_CHAT_LISTENERS,
    ACTIVE_INGESTORS,
    CHAT_MESSAGES,
    HYPE_MOMENTS_FIRED,
)
from .redis_helper import UpstashClient
from .spike_detector import SpikeDetector
from .twitch_chat import TwitchChatListener
from .twitch_live import stream_status

log = logging.getLogger(__name__)


@dataclass
class _RunningTask:
    task: asyncio.Task[IngestorRunResult]
    cancel: asyncio.Event = field(default_factory=asyncio.Event)


@dataclass
class _ChatTask:
    """A chat listener + its spike detector + the asyncio tasks
    running both. The scheduler owns the lifecycle."""
    listener: TwitchChatListener
    detector: SpikeDetector
    listener_task: asyncio.Task[None]
    detector_task: asyncio.Task[None]


def _supabase() -> Client:
    s = settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


class Scheduler:
    def __init__(self) -> None:
        self._http: httpx.AsyncClient | None = None
        self._redis: UpstashClient | None = None
        self._tasks: dict[str, _RunningTask] = {}
        self._chats: dict[str, _ChatTask] = {}
        self._stop_event = asyncio.Event()
        self._supabase = _supabase()

    async def start(self) -> None:
        self._http = httpx.AsyncClient(timeout=10.0)
        self._redis = UpstashClient()
        asyncio.create_task(self._run_forever(), name="scheduler-loop")
        log.info("scheduler: started")

    async def stop(self) -> None:
        self._stop_event.set()
        # Tell all ingestors + chat tasks to wrap up.
        for rt in self._tasks.values():
            rt.cancel.set()
        for ct in self._chats.values():
            ct.listener.stop()
            ct.detector.stop()
        await asyncio.gather(
            *(rt.task for rt in self._tasks.values()),
            *(ct.listener_task for ct in self._chats.values()),
            *(ct.detector_task for ct in self._chats.values()),
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
        for channel_id in list(self._chats):
            ct = self._chats[channel_id]
            if ct.listener_task.done() and ct.detector_task.done():
                self._chats.pop(channel_id)
                ACTIVE_CHAT_LISTENERS.dec()

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

                # Audio-energy detector lives for the duration of the
                # ingestor. Shares the same hype-moment handler as the
                # chat-side spike detector — the Inngest debounce in
                # liveHypeMoment (Phase 2.3+) will merge close-in-time
                # signals on the same channel.
                async def on_audio_hype(_cid: str, reason: str, hpayload: dict) -> None:
                    HYPE_MOMENTS_FIRED.labels(reason=reason).inc()
                    await send_event(name="clip/hype-moment", data=hpayload)

                audio = AudioEnergyDetector(
                    channel_id=channel_id,
                    channel_login=login,
                    on_hype=on_audio_hype,
                )
                task = asyncio.create_task(
                    run_ingestor(
                        channel_id=channel_id,
                        twitch_login=login,
                        http=self._http,
                        redis=self._redis,
                        cancel_event=cancel_event,
                        on_segment=audio.on_segment,
                    ),
                    name=f"ingestor-{channel_id[:8]}",
                )
                self._tasks[channel_id] = _RunningTask(task=task, cancel=cancel_event)
                ACTIVE_INGESTORS.inc()
                log.info("scheduler: started ingestor for %s (%s)", login, channel_id[:8])
            elif not status.is_live and running:
                running.cancel.set()
                # The task removes itself on next tick via the reap loop.

            # Chat task mirrors ingestor lifecycle: present iff channel
            # is live. Carries its own spike detector + Inngest sender.
            chat_running = self._chats.get(channel_id)
            if status.is_live and not chat_running:
                self._chats[channel_id] = self._start_chat(channel_id, login)
                ACTIVE_CHAT_LISTENERS.inc()
                log.info("scheduler: started chat for %s (%s)", login, channel_id[:8])
            elif not status.is_live and chat_running:
                chat_running.listener.stop()
                chat_running.detector.stop()
                # Tasks remove themselves on next tick via the reap loop.

    def _start_chat(self, channel_id: str, login: str) -> _ChatTask:
        async def on_hype(cid: str, reason: str, payload: dict) -> None:
            HYPE_MOMENTS_FIRED.labels(reason=reason).inc()
            await send_event(name="clip/hype-moment", data=payload)

        detector = SpikeDetector(
            channel_id=channel_id,
            channel_login=login,
            on_hype=on_hype,
        )

        async def on_message(channel: str, nick: str, text: str, ts: float) -> None:
            CHAT_MESSAGES.inc()
            await detector.on_message(channel, nick, text, ts)

        listener = TwitchChatListener(channel_login=login, on_message=on_message)
        listener_task = asyncio.create_task(
            listener.run(), name=f"chat-{channel_id[:8]}"
        )
        detector_task = asyncio.create_task(
            detector.run(), name=f"spike-{channel_id[:8]}"
        )
        return _ChatTask(
            listener=listener,
            detector=detector,
            listener_task=listener_task,
            detector_task=detector_task,
        )


_scheduler: Scheduler | None = None


def scheduler() -> Scheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = Scheduler()
    return _scheduler

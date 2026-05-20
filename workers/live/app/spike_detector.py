"""Chat-spike + keyword detector.

One detector instance per channel. The TwitchChatListener's
`on_message` callback funnels every incoming PRIVMSG here. Every
~1 second a background tick recomputes msg-per-second over the last
10 seconds and compares it against the last 5 minutes baseline; when
the ratio + absolute thresholds both pop, we fire a `clip/hype-moment`
Inngest event.

Thresholds (mirroring the prompt-pack defaults):
  - current 10s msgs/sec >= 4× baseline 5min msgs/sec
  - AND current 10s msgs/sec >= 30 msgs/s absolute floor
  - OR keyword cluster (>=8 instances of any tracked keyword in 5s)

Cooldown: after firing, the detector mutes for 60s so we don't
hype-spam the pipeline for a single moment of chat hysteria.

V1 keeps state in-process — single Fly machine, single owning task.
When we scale out we move to Redis sorted sets.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from typing import Awaitable, Callable

log = logging.getLogger(__name__)

# Window sizes in seconds.
SHORT_WINDOW_S = 10.0
BASELINE_WINDOW_S = 300.0          # 5 min
KEYWORD_WINDOW_S = 5.0
DETECT_INTERVAL_S = 1.0
COOLDOWN_S = 60.0

# Spike thresholds.
SPIKE_RATIO = 4.0                  # current >= N × baseline
SPIKE_FLOOR_MSG_S = 30.0           # current >= N msgs/s absolute
KEYWORD_CLUSTER_THRESHOLD = 8

# Tracked keywords — case-insensitive substring match on each message.
# Per-channel custom keywords (Phase 3 streamer settings) extend this set.
GLOBAL_KEYWORDS = ("pog", "poggers", "omegalul", "clip it", "clip that", "lulw", "kekw")


HypeFiredCallback = Callable[[str, str, dict], Awaitable[None]]
"""(channel_id, reason, payload) → awaitable.

Called when the detector fires. `payload` contains channelId,
detectedAt, score, reason, plus stats for observability."""


class SpikeDetector:
    def __init__(
        self,
        *,
        channel_id: str,
        channel_login: str,
        on_hype: HypeFiredCallback,
    ) -> None:
        self._channel_id = channel_id
        self._channel_login = channel_login
        self._on_hype = on_hype
        self._timestamps: deque[float] = deque()  # msg timestamps in last 5 min
        self._keyword_hits: deque[float] = deque()  # keyword timestamps in last 5s
        self._last_fired_at: float = 0.0
        self._messages_seen: int = 0
        self._stop = asyncio.Event()

    @property
    def messages_seen(self) -> int:
        return self._messages_seen

    def stop(self) -> None:
        self._stop.set()

    async def on_message(self, _channel: str, _nick: str, text: str, ts: float) -> None:
        self._messages_seen += 1
        self._timestamps.append(ts)
        lowered = text.lower()
        if any(k in lowered for k in GLOBAL_KEYWORDS):
            self._keyword_hits.append(ts)

    async def run(self) -> None:
        try:
            while not self._stop.is_set():
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=DETECT_INTERVAL_S)
                    return
                except asyncio.TimeoutError:
                    pass
                await self._tick()
        except asyncio.CancelledError:
            return

    async def _tick(self) -> None:
        now = time.time()

        # Prune old entries from the deques.
        baseline_cutoff = now - BASELINE_WINDOW_S
        keyword_cutoff = now - KEYWORD_WINDOW_S
        while self._timestamps and self._timestamps[0] < baseline_cutoff:
            self._timestamps.popleft()
        while self._keyword_hits and self._keyword_hits[0] < keyword_cutoff:
            self._keyword_hits.popleft()

        # Cooldown.
        if now - self._last_fired_at < COOLDOWN_S:
            return

        baseline_msgs = len(self._timestamps)
        baseline_per_s = baseline_msgs / BASELINE_WINDOW_S if baseline_msgs else 0.0

        # Short-window msgs/s.
        short_cutoff = now - SHORT_WINDOW_S
        short_msgs = sum(1 for t in self._timestamps if t >= short_cutoff)
        short_per_s = short_msgs / SHORT_WINDOW_S

        spike_ratio = (
            short_per_s / baseline_per_s
            if baseline_per_s > 0
            else float("inf") if short_per_s > 0 else 0.0
        )

        is_chat_spike = (
            short_per_s >= SPIKE_FLOOR_MSG_S
            and spike_ratio >= SPIKE_RATIO
        )
        keyword_count = len(self._keyword_hits)
        is_keyword_cluster = keyword_count >= KEYWORD_CLUSTER_THRESHOLD

        if not (is_chat_spike or is_keyword_cluster):
            return

        reason = "chat_spike" if is_chat_spike else "keyword_cluster"
        # Score: bigger of (spike ratio, normalized keyword density).
        score = round(
            max(
                spike_ratio if spike_ratio != float("inf") else SPIKE_RATIO * 2,
                keyword_count / KEYWORD_CLUSTER_THRESHOLD,
            ),
            2,
        )

        payload = {
            "channelId": self._channel_id,
            "channelLogin": self._channel_login,
            "detectedAt": int(now * 1000),
            "score": score,
            "reason": reason,
            "stats": {
                "shortMsgPerSec": round(short_per_s, 2),
                "baselineMsgPerSec": round(baseline_per_s, 2),
                "keywordHits5s": keyword_count,
            },
        }

        self._last_fired_at = now
        log.info(
            "spike[%s]: 🔥 %s score=%.2f short=%.1f/s baseline=%.2f/s kw=%d",
            self._channel_login, reason, score, short_per_s, baseline_per_s, keyword_count,
        )
        try:
            await self._on_hype(self._channel_id, reason, payload)
        except Exception as exc:  # noqa: BLE001
            log.warning("spike[%s]: on_hype handler raised %s", self._channel_login, exc)

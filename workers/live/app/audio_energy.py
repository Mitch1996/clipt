"""Audio-energy hype-moment detector.

Hooks into the per-channel ingestor's segment cycle: every time a new
HLS `.ts` segment is written to S3, the ingestor passes its bytes here
for a quick loudness probe.

Algorithm (V1, mirrors the chat-spike approach):
  - For each segment, run ffmpeg with `-af volumedetect -f null -`,
    parse the `mean_volume` (dB) and `max_volume` from stderr.
  - Push `mean_volume` into a per-channel deque keyed by segment timestamp.
  - Window = last 5 minutes; samples older than that are pruned.
  - Threshold = 90th percentile of the baseline window.
  - When the most recent N (default 2) consecutive segments are above
    the threshold AND the channel isn't in cooldown, fire a hype moment
    with `reason='audio_yell'`.

V1 scope: loudness only. Voice activity detection ("yell with speech
ranks higher") + silence-then-burst pattern are TODO for 2.3+.

Designed as a class so the scheduler can hold one instance per channel
alongside its TwitchChatListener + SpikeDetector.
"""
from __future__ import annotations

import asyncio
import logging
import re
import subprocess
import tempfile
import time
from collections import deque
from typing import Awaitable, Callable

from .metrics import AUDIO_SAMPLES_TAKEN

log = logging.getLogger(__name__)

BASELINE_WINDOW_S = 300.0
PERCENTILE = 0.90
CONSECUTIVE_HOT_SEGMENTS = 2
COOLDOWN_S = 60.0
# Don't fire until we've observed at least this many samples — otherwise
# the very first loud segment after process start would always trip.
MIN_BASELINE_SAMPLES = 60

# `mean_volume: -23.4 dB` from ffmpeg's volumedetect filter.
_MEAN_VOLUME_RE = re.compile(r"mean_volume:\s*(?P<v>-?\d+(?:\.\d+)?)\s*dB")


HypeFiredCallback = Callable[[str, str, dict], Awaitable[None]]
"""(channel_id, reason, payload) → awaitable. Same signature as
SpikeDetector so the scheduler can wire either into the same handler."""


class AudioEnergyDetector:
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
        # deque of (ts_seconds, mean_volume_db)
        self._samples: deque[tuple[float, float]] = deque()
        self._last_fired_at = 0.0

    @property
    def samples_seen(self) -> int:
        return len(self._samples)

    async def on_segment(self, segment_bytes: bytes) -> None:
        """Called by the ingestor immediately after a successful S3 PUT.

        We run ffmpeg in a thread so the asyncio loop isn't blocked by
        the subprocess wait — `volumedetect` is fast (~50–100 ms per
        2-second segment) but stacking on the event loop adds up
        across many concurrent channels.
        """
        now = time.time()
        try:
            mean_db = await asyncio.to_thread(self._volumedetect, segment_bytes)
        except Exception as exc:  # noqa: BLE001
            log.warning("audio[%s]: volumedetect failed %s", self._channel_login, exc)
            return
        if mean_db is None:
            return
        AUDIO_SAMPLES_TAKEN.inc()
        self._samples.append((now, mean_db))
        self._prune(now)
        await self._maybe_fire(now)

    def _prune(self, now: float) -> None:
        cutoff = now - BASELINE_WINDOW_S
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()

    async def _maybe_fire(self, now: float) -> None:
        if len(self._samples) < MIN_BASELINE_SAMPLES:
            return
        if now - self._last_fired_at < COOLDOWN_S:
            return
        baseline = sorted(v for _, v in self._samples)
        idx = max(0, int(len(baseline) * PERCENTILE) - 1)
        threshold = baseline[idx]
        recent = list(self._samples)[-CONSECUTIVE_HOT_SEGMENTS:]
        if len(recent) < CONSECUTIVE_HOT_SEGMENTS:
            return
        if not all(v >= threshold for _, v in recent):
            return

        # `mean_volume` is in dBFS — closer to 0 = louder. A typical
        # speech-level threshold lands around -25..-15 dB; floor the
        # threshold at -30 dB so we don't fire on quiet recordings
        # where the 90th-percentile baseline is itself very low.
        if threshold < -30:
            return

        max_recent = max(v for _, v in recent)
        score = round(max_recent - threshold + 1.0, 2)  # how much above threshold

        payload = {
            "channelId": self._channel_id,
            "channelLogin": self._channel_login,
            "detectedAt": int(now * 1000),
            "score": score,
            "reason": "audio_yell",
            "stats": {
                "thresholdDb": round(threshold, 2),
                "maxDb": round(max_recent, 2),
                "baselineSamples": len(self._samples),
            },
        }

        self._last_fired_at = now
        log.info(
            "audio[%s]: 🔊 audio_yell score=%.2f max=%.2fdB thresh=%.2fdB",
            self._channel_login, score, max_recent, threshold,
        )
        try:
            await self._on_hype(self._channel_id, "audio_yell", payload)
        except Exception as exc:  # noqa: BLE001
            log.warning("audio[%s]: on_hype handler raised %s", self._channel_login, exc)

    def _volumedetect(self, segment_bytes: bytes) -> float | None:
        """Synchronous ffmpeg call → mean_volume in dB, or None on parse fail."""
        with tempfile.NamedTemporaryFile(suffix=".ts", delete=False) as tmp:
            tmp.write(segment_bytes)
            tmp_path = tmp.name
        try:
            res = subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "info",
                    "-i", tmp_path,
                    "-af", "volumedetect",
                    "-f", "null", "-",
                ],
                capture_output=True, text=True, timeout=10,
            )
            # `volumedetect` writes its summary to stderr (where ffmpeg
            # writes all -loglevel info diagnostics).
            match = _MEAN_VOLUME_RE.search(res.stderr or "")
            if not match:
                return None
            return float(match.group("v"))
        finally:
            try:
                import os
                os.unlink(tmp_path)
            except Exception:  # noqa: BLE001
                pass

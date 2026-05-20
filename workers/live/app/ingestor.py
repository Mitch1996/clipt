"""Per-channel HLS ingestor.

Lifecycle (one asyncio task per live channel):
  1. Resolve master m3u8 → pick a single variant playlist (~720p).
  2. Loop:
     a. Re-fetch the variant playlist.
     b. For each segment URL we haven't seen, download bytes + PUT to
        S3 at `live/{channelId}/{segmentTs}.ts` + update the Redis
        head pointer.
     c. Prune S3 keys older than the rolling-buffer window
        (config.rolling_buffer_s).
     d. Sleep config.playlist_poll_s.
  3. Stop when the playlist returns no new segments for
     `config.ingest_idle_s` (channel went offline or stuck).

Quality selection: V1 takes the LOWEST-bitrate 720p (≈3 Mbps); we're
buffering for clipping moments, not archival. Avoids burning bytes on
source-quality 8 Mbps streams.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass

import boto3
import httpx
from botocore.client import Config as BotoConfig

from .config import settings
from .metrics import (
    BYTES_INGESTED,
    INGEST_CYCLE_SECONDS,
    SEGMENTS_DROPPED,
    SEGMENTS_PERSISTED,
)
from .redis_helper import UpstashClient
from .twitch_live import resolve_hls_playlist

log = logging.getLogger(__name__)


@dataclass
class IngestorRunResult:
    bytes_ingested: int
    segments_persisted: int
    stopped_reason: str


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


def _segment_key(channel_id: str, ts_seconds: float) -> str:
    # Millisecond precision so rapid-fire segments don't collide. We
    # don't use the upstream segment URL fragment as the suffix because
    # Twitch occasionally reuses paths across reconnects.
    return f"live/{channel_id}/{int(ts_seconds * 1000):015d}.ts"


# Master m3u8 EXT-X-STREAM-INF lines look like:
#   #EXT-X-STREAM-INF:BANDWIDTH=3210567,RESOLUTION=1280x720,CODECS="...",VIDEO="720p60"
#   https://video-weaver.ams01.hls.ttvnw.net/.../720p60/index-live.m3u8
_VARIANT_LINE_RE = re.compile(r"^#EXT-X-STREAM-INF:(?P<attrs>[^\n]+)\n(?P<url>https?://[^\n]+)", re.MULTILINE)
_RESOLUTION_RE = re.compile(r"RESOLUTION=(?P<w>\d+)x(?P<h>\d+)")
_BANDWIDTH_RE = re.compile(r"BANDWIDTH=(?P<bw>\d+)")


def _pick_variant(master_m3u8: str) -> str | None:
    """Pick the lowest-bitrate variant ≥720p. Falls back to the
    lowest-bitrate variant overall if no 720p is published."""
    variants: list[tuple[int, int, str]] = []  # (height, bandwidth, url)
    for m in _VARIANT_LINE_RE.finditer(master_m3u8):
        attrs = m.group("attrs")
        url = m.group("url").strip()
        res_m = _RESOLUTION_RE.search(attrs)
        bw_m = _BANDWIDTH_RE.search(attrs)
        height = int(res_m.group("h")) if res_m else 0
        bandwidth = int(bw_m.group("bw")) if bw_m else 0
        variants.append((height, bandwidth, url))
    if not variants:
        return None
    # Sort by (resolution-meets-target descending, bandwidth ascending)
    # so 720p with the lowest bitrate wins; fall back to the smallest
    # available stream when nothing is 720p+.
    above_720 = [v for v in variants if v[0] >= 720]
    if above_720:
        above_720.sort(key=lambda v: (v[0] != 720, v[1]))
        return above_720[0][2]
    variants.sort(key=lambda v: v[1])
    return variants[0][2]


# Variant playlist segments look like:
#   #EXTINF:2.000,live
#   https://video-weaver.ams01.hls.ttvnw.net/.../index-0000000123.ts
_EXTINF_RE = re.compile(r"^#EXTINF:[^\n]+\n(?P<url>https?://[^\n]+)", re.MULTILINE)


def _segment_urls(variant_m3u8: str) -> list[str]:
    return [m.group("url").strip() for m in _EXTINF_RE.finditer(variant_m3u8)]


async def run_ingestor(
    *,
    channel_id: str,
    twitch_login: str,
    http: httpx.AsyncClient,
    redis: UpstashClient,
    cancel_event: asyncio.Event,
) -> IngestorRunResult:
    cfg = settings()
    s3 = _s3_client()

    log.info("ingestor[%s]: resolving HLS for %s", channel_id[:8], twitch_login)
    master_url = await resolve_hls_playlist(twitch_login, http)
    if not master_url:
        return IngestorRunResult(0, 0, "no-playlist")

    master_res = await http.get(master_url, timeout=10.0)
    if master_res.status_code != 200:
        return IngestorRunResult(0, 0, f"master-{master_res.status_code}")
    variant_url = _pick_variant(master_res.text)
    if not variant_url:
        return IngestorRunResult(0, 0, "no-variant")

    log.info(
        "ingestor[%s]: starting loop on variant %s",
        channel_id[:8],
        variant_url[:120],
    )

    seen_urls: set[str] = set()
    persisted_keys: list[tuple[float, str]] = []  # (ts_seconds, s3_key)
    last_segment_at = time.time()
    bytes_total = 0
    segments_total = 0
    stopped_reason = "cancelled"

    try:
        while not cancel_event.is_set():
            cycle_start = time.time()
            try:
                playlist_res = await http.get(variant_url, timeout=10.0)
            except httpx.HTTPError as exc:
                log.warning(
                    "ingestor[%s]: playlist fetch error %s", channel_id[:8], exc
                )
                await asyncio.sleep(cfg.playlist_poll_s)
                continue
            if playlist_res.status_code == 404:
                stopped_reason = "playlist-404"
                break
            if playlist_res.status_code != 200:
                await asyncio.sleep(cfg.playlist_poll_s)
                continue
            seg_urls = _segment_urls(playlist_res.text)
            new_segments = [u for u in seg_urls if u not in seen_urls]

            for seg_url in new_segments:
                if cancel_event.is_set():
                    break
                try:
                    seg_res = await http.get(seg_url, timeout=10.0)
                    if seg_res.status_code != 200:
                        SEGMENTS_DROPPED.labels(reason=f"fetch-{seg_res.status_code}").inc()
                        continue
                    seg_bytes = seg_res.content
                except httpx.HTTPError as exc:
                    log.warning("ingestor[%s]: segment fetch %s", channel_id[:8], exc)
                    SEGMENTS_DROPPED.labels(reason="fetch-error").inc()
                    continue
                ts = time.time()
                key = _segment_key(channel_id, ts)
                try:
                    s3.put_object(
                        Bucket=cfg.storage_bucket,
                        Key=key,
                        Body=seg_bytes,
                        ContentType="video/mp2t",
                    )
                except Exception as exc:  # noqa: BLE001
                    log.warning("ingestor[%s]: s3 put %s", channel_id[:8], exc)
                    SEGMENTS_DROPPED.labels(reason="s3-put").inc()
                    continue

                # Update Redis head pointer + record persistence.
                await redis.set(
                    f"live:{channel_id}:latestSegment",
                    key,
                    ex_seconds=int(cfg.rolling_buffer_s) + 60,
                )

                seen_urls.add(seg_url)
                persisted_keys.append((ts, key))
                bytes_total += len(seg_bytes)
                segments_total += 1
                last_segment_at = ts
                SEGMENTS_PERSISTED.inc()
                BYTES_INGESTED.inc(len(seg_bytes))

            # Prune segments older than the rolling buffer window.
            cutoff = time.time() - cfg.rolling_buffer_s
            to_delete: list[str] = []
            keep: list[tuple[float, str]] = []
            for ts, key in persisted_keys:
                if ts < cutoff:
                    to_delete.append(key)
                else:
                    keep.append((ts, key))
            persisted_keys = keep
            for key in to_delete:
                try:
                    s3.delete_object(Bucket=cfg.storage_bucket, Key=key)
                except Exception as exc:  # noqa: BLE001
                    log.warning("ingestor[%s]: s3 delete %s", channel_id[:8], exc)

            INGEST_CYCLE_SECONDS.observe(time.time() - cycle_start)

            # If we've gone idle on new segments for the configured
            # threshold the upstream is probably done — stop.
            if time.time() - last_segment_at > cfg.ingest_idle_s:
                stopped_reason = "idle"
                break

            try:
                await asyncio.wait_for(
                    cancel_event.wait(),
                    timeout=cfg.playlist_poll_s,
                )
                stopped_reason = "cancelled"
                break
            except asyncio.TimeoutError:
                pass
    finally:
        # Best-effort cleanup of remaining buffer on stop.
        for _, key in persisted_keys:
            try:
                s3.delete_object(Bucket=cfg.storage_bucket, Key=key)
            except Exception:  # noqa: BLE001
                pass
        try:
            await redis.delete(f"live:{channel_id}:latestSegment")
        except Exception:  # noqa: BLE001
            pass

    log.info(
        "ingestor[%s]: stopped (%s), %d segments / %d MB",
        channel_id[:8],
        stopped_reason,
        segments_total,
        bytes_total // (1024 * 1024),
    )
    return IngestorRunResult(
        bytes_ingested=bytes_total,
        segments_persisted=segments_total,
        stopped_reason=stopped_reason,
    )

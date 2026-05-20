"""Prometheus counters for the live-ingestion worker.

Exposed at /metrics in text format. Fly's own metrics scrape can pick
this up; locally `curl /metrics` works the same.
"""
from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

# Number of per-channel asyncio ingestor tasks currently running.
ACTIVE_INGESTORS = Gauge(
    "clipt_live_active_ingestors",
    "Per-channel asyncio ingestor tasks currently running.",
)

# Bytes ingested across all channels since process start.
BYTES_INGESTED = Counter(
    "clipt_live_bytes_ingested_total",
    "Total bytes of HLS segments downloaded + PUT to S3 since process start.",
)

# Segments dropped because the PUT failed or the segment was already
# present (rare race). Useful for spotting Twitch / S3 instability.
SEGMENTS_DROPPED = Counter(
    "clipt_live_segments_dropped_total",
    "HLS segments the ingestor saw but couldn't successfully persist.",
    ["reason"],
)

# Segments successfully PUT to S3.
SEGMENTS_PERSISTED = Counter(
    "clipt_live_segments_persisted_total",
    "HLS segments successfully written to S3.",
)

# Wall-clock time of a single playlist→segment→S3 cycle, in seconds.
INGEST_CYCLE_SECONDS = Histogram(
    "clipt_live_ingest_cycle_seconds",
    "Per-iteration latency of an ingestor loop.",
    buckets=(0.1, 0.25, 0.5, 1, 2, 4, 8, 16),
)

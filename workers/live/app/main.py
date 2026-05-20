"""FastAPI entrypoint for the live-ingestion worker.

Exposes:
  - GET /healthz      — liveness probe (Fly health check)
  - GET /metrics      — Prometheus text-format counters/gauges

The scheduler runs as a background asyncio task started on app
startup; FastAPI only exists to serve health + metrics. Nothing else
in the codebase POSTs here.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from .jobs import router as jobs_router
from .probe import router as probe_router
from .scheduler import scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    s = scheduler()
    await s.start()
    try:
        yield
    finally:
        await s.stop()


app = FastAPI(title="clipt-live-worker", version="0.1.0", lifespan=lifespan)
app.include_router(jobs_router)
app.include_router(probe_router)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@app.get("/metrics")
def metrics() -> Response:
    return PlainTextResponse(
        generate_latest().decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )

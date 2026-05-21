"""FastAPI entry point for the Clipt video worker.

Exposes:
  - GET  /healthz                — liveness probe (no auth)
  - POST /jobs/transcribe        — Whisper captions          (stub today)
  - POST /jobs/reframe           — 9:16 reframe + caption burn (stub today)
  - POST /jobs/download-youtube  — yt-dlp source pull         (stub today)

Every /jobs/* request requires a JWT signed with WORKER_HMAC_KEY.
"""
from __future__ import annotations

import logging

from fastapi import Depends, FastAPI

from .auth import verify_bearer
from .jobs import detect_face_cam, download_youtube, reframe, transcribe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="clipt-video-worker", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@app.post("/jobs/transcribe", response_model=transcribe.TranscribeOut)
def transcribe_route(
    payload: transcribe.TranscribeIn,
    _claims: dict = Depends(verify_bearer),
):
    return transcribe.run(payload)


@app.post("/jobs/reframe", response_model=reframe.ReframeOut)
def reframe_route(
    payload: reframe.ReframeIn,
    _claims: dict = Depends(verify_bearer),
):
    return reframe.run(payload)


@app.post("/jobs/download-youtube", response_model=download_youtube.DownloadYouTubeOut)
def download_youtube_route(
    payload: download_youtube.DownloadYouTubeIn,
    _claims: dict = Depends(verify_bearer),
):
    return download_youtube.run(payload)


app.include_router(detect_face_cam.router)

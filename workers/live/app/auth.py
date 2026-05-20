"""JWT-signed request guard for the live worker's /jobs/* endpoints.

Mirrors workers/video/app/auth.py — the Next side signs an HS256 JWT
with WORKER_HMAC_KEY, audience `clipt-live-worker`, and we verify on
each call. /dev/* endpoints have their own DEV_PROBE_TOKEN guard.

Audience differs from the video worker's `clipt-video-worker` on
purpose so a token minted for one service can't be replayed at the
other.
"""
from __future__ import annotations

import os

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

AUDIENCE = "clipt-live-worker"
ALGORITHM = "HS256"


def verify_bearer(
    authorization: str | None = Header(default=None),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    token = authorization.split(" ", 1)[1].strip()
    key = os.environ.get("WORKER_HMAC_KEY")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Worker auth not configured",
        )
    try:
        payload = jwt.decode(
            token, key, algorithms=[ALGORITHM], audience=AUDIENCE,
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Invalid worker token: {exc}",
        ) from exc
    return payload

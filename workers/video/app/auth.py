"""JWT-signed request guard.

Every job endpoint requires an `Authorization: Bearer <jwt>` header
where the JWT is HS256-signed with WORKER_HMAC_KEY. We verify the
signature, audience, and expiry. The Next side (apps/web/src/lib/
workers/videoWorker.ts) signs the same way.

Audience: 'clipt-video-worker'. Anything else is rejected so a token
minted for some other service can't be replayed here.
"""
from __future__ import annotations

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from .config import settings

AUDIENCE = "clipt-video-worker"
ALGORITHM = "HS256"


def verify_bearer(
    authorization: str | None = Header(default=None),
) -> dict:
    """FastAPI dependency that verifies the Authorization header.

    Returns the decoded JWT claims so callers (e.g. logging) can read
    them. Raises 401 / 403 on any failure.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    token = authorization.split(" ", 1)[1].strip()

    try:
        payload = jwt.decode(
            token,
            settings().worker_hmac_key,
            algorithms=[ALGORITHM],
            audience=AUDIENCE,
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Invalid worker token: {exc}",
        ) from exc

    return payload

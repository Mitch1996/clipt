"""Thin async wrapper around the Upstash REST API.

Uses the JSON-body POST form (POST / with body = [command, ...args])
rather than the path-based GET form because our values are S3 keys
that contain slashes — those break the path parser and return 400.

Surfaces just the ops the ingestor needs: SET with TTL, GET, DEL.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from .config import settings


class UpstashClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        s = settings()
        self._base = s.upstash_redis_rest_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {s.upstash_redis_rest_token}",
            "content-type": "application/json",
        }
        self._client = client or httpx.AsyncClient(timeout=5.0, headers=self._headers)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _exec(self, *args: str) -> Any:
        # Upstash REST: POST /{} with body = JSON array of redis command
        # + args. Handles any byte content (slashes, spaces, etc.)
        # without URL-encoding gymnastics.
        res = await self._client.post(self._base, content=json.dumps(list(args)))
        res.raise_for_status()
        return res.json().get("result")

    async def set(self, key: str, value: str, ex_seconds: int | None = None) -> None:
        args: list[str] = ["SET", key, value]
        if ex_seconds is not None:
            args += ["EX", str(ex_seconds)]
        await self._exec(*args)

    async def get(self, key: str) -> str | None:
        result = await self._exec("GET", key)
        return None if result is None else str(result)

    async def delete(self, *keys: str) -> int:
        if not keys:
            return 0
        result = await self._exec("DEL", *keys)
        return int(result or 0)

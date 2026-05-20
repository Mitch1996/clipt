"""Thin async wrapper around the Upstash REST API.

We use REST (HTTPS) rather than the Redis protocol because:
  1. The Upstash REST client survives long-lived HTTP connections
     better than redis-py inside an asyncio loop where ingestor tasks
     come and go.
  2. Auth is a single bearer header — easier than the SSL + AUTH
     handshake the protocol needs.
  3. Free tier only has a 10k cmd/day budget; REST is fine for that.

Surfaces just the ops the ingestor needs: SET with TTL, GET, DEL.
"""
from __future__ import annotations

from typing import Any

import httpx

from .config import settings


class UpstashClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        s = settings()
        self._base = s.upstash_redis_rest_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {s.upstash_redis_rest_token}"}
        self._client = client or httpx.AsyncClient(timeout=5.0, headers=self._headers)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _post(self, path: list[str], body: Any = None) -> Any:
        url = f"{self._base}/{'/'.join(path)}"
        res = await self._client.post(url, json=body) if body is not None else await self._client.get(url)
        res.raise_for_status()
        return res.json().get("result")

    async def set(self, key: str, value: str, ex_seconds: int | None = None) -> None:
        path = ["set", key, value]
        if ex_seconds is not None:
            path += ["EX", str(ex_seconds)]
        await self._post(path)

    async def get(self, key: str) -> str | None:
        result = await self._post(["get", key])
        return None if result is None else str(result)

    async def delete(self, *keys: str) -> int:
        if not keys:
            return 0
        result = await self._post(["del", *keys])
        return int(result or 0)

"""S3-compatible storage helper.

Works against Cloudflare R2 in production (when configured) and
Supabase Storage's S3 endpoint during dev. Same boto3 client handles
both — only the credentials + endpoint URL differ.

Bucket layout matches the Next side (apps/web/src/lib/storage/r2.ts):
  sources/{clipId}.{ext}
  verticals/{clipId}.mp4
  thumbnails/{clipId}.jpg
  captions/{clipId}.json
"""
from __future__ import annotations

import io
import json
from functools import lru_cache
from typing import Iterable

import boto3
from botocore.client import Config

from .config import settings


@lru_cache(maxsize=1)
def _client():
    s = settings()
    # Only pass endpoint_url when truthy — boto3 picks the default AWS
    # regional endpoint when omitted, but errors with "Invalid endpoint"
    # if given an empty string.
    kwargs: dict = {
        "aws_access_key_id": s.storage_access_key_id,
        "aws_secret_access_key": s.storage_secret_access_key,
        "region_name": s.storage_region,
        "config": Config(signature_version="s3v4"),
    }
    if s.storage_endpoint_url:
        kwargs["endpoint_url"] = s.storage_endpoint_url
    return boto3.client("s3", **kwargs)


def put_bytes(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(
        Bucket=settings().storage_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def put_json(key: str, payload: dict | list) -> None:
    body = json.dumps(payload).encode("utf-8")
    put_bytes(key, body, "application/json")


def put_stream(key: str, stream: Iterable[bytes], content_type: str) -> None:
    """Upload a streamable iterator. boto3 wants a file-like object,
    so we wrap into a BytesIO for now — real streaming swaps in a
    Multipart upload in Prompt 1.10."""
    buf = io.BytesIO()
    for chunk in stream:
        buf.write(chunk)
    buf.seek(0)
    put_bytes(key, buf.getvalue(), content_type)


def get_bytes(key: str) -> bytes:
    res = _client().get_object(Bucket=settings().storage_bucket, Key=key)
    return res["Body"].read()


def storage_keys(clip_id: str) -> dict[str, str]:
    """Single source of truth for bucket layout, mirrors the Next side
    (apps/web/src/lib/storage/r2.ts)."""
    return {
        "source_mp4": f"sources/{clip_id}.mp4",
        "vertical_mp4": f"verticals/{clip_id}.mp4",
        "thumbnail_jpg": f"thumbnails/{clip_id}.jpg",
        "captions_json": f"captions/{clip_id}.json",
    }

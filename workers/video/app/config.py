"""Runtime configuration loaded from environment.

The worker is invoked by Inngest functions over HTTP. It needs:
  - WORKER_HMAC_KEY: shared secret for JWT verification (same value the
    Next side signs with).
  - Storage credentials so each job can read sources and write
    artifacts. We use the S3-compatible endpoint of Cloudflare R2 (when
    available) or Supabase Storage (today). Both expose the same boto3
    interface.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    worker_hmac_key: str
    # Storage — S3-compatible. Either the Cloudflare R2 set OR the
    # Supabase Storage S3 endpoint. Keep both pairs; the storage helper
    # picks whichever set is populated.
    storage_endpoint_url: str | None
    storage_access_key_id: str | None
    storage_secret_access_key: str | None
    storage_bucket: str
    storage_region: str

    @classmethod
    def load(cls) -> "Settings":
        worker_hmac_key = os.environ.get("WORKER_HMAC_KEY")
        if not worker_hmac_key:
            raise RuntimeError(
                "WORKER_HMAC_KEY not set. Generate one with "
                "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` "
                "and add to .env (locally) or `fly secrets set` (prod).",
            )

        # Cloudflare R2 takes priority when present. Otherwise use the
        # Supabase Storage S3-compatible endpoint, which any Supabase
        # project exposes at <project>.supabase.co/storage/v1/s3.
        endpoint = (
            os.environ.get("R2_ENDPOINT")
            or os.environ.get("STORAGE_ENDPOINT_URL")
        )
        access_key = (
            os.environ.get("R2_ACCESS_KEY_ID")
            or os.environ.get("STORAGE_ACCESS_KEY_ID")
        )
        secret_key = (
            os.environ.get("R2_SECRET_ACCESS_KEY")
            or os.environ.get("STORAGE_SECRET_ACCESS_KEY")
        )
        bucket = (
            os.environ.get("R2_BUCKET")
            or os.environ.get("STORAGE_BUCKET")
            or "clipt-media"
        )
        region = os.environ.get("STORAGE_REGION", "auto")

        return cls(
            worker_hmac_key=worker_hmac_key,
            storage_endpoint_url=endpoint,
            storage_access_key_id=access_key,
            storage_secret_access_key=secret_key,
            storage_bucket=bucket,
            storage_region=region,
        )


def settings() -> Settings:
    return Settings.load()

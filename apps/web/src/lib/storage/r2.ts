import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage facade.
 *
 * Now talks to **AWS S3** in production. The file is still named `r2.ts`
 * because the API surface matches the Cloudflare R2 contract from the
 * prompt pack (both are S3-compatible). Earlier this module hit
 * Supabase Storage via the Supabase SDK; the swap to real S3 only
 * touched this file and the `STORAGE_*` env vars.
 *
 * Bucket layout (`StorageKeys` below is the single source of truth):
 *
 *   sources/{clipId}.{ext}         original source video
 *   verticals/{clipId}.mp4         9:16 export with burned captions
 *   thumbnails/{clipId}.jpg        poster frame
 *   captions/{clipId}.json         word-timed captions
 *
 * Reads go through signed URLs (`getSignedDownloadUrl`). Pipeline
 * writes use `putObject` directly (the S3 client is initialised with
 * IAM-user creds via STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY).
 */

export const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? "clipt-media";

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (cachedClient) return cachedClient;
  const region = process.env.STORAGE_REGION;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Storage not configured: STORAGE_REGION + STORAGE_ACCESS_KEY_ID + STORAGE_SECRET_ACCESS_KEY required",
    );
  }
  cachedClient = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    // Optional override for S3-compatible backends (Cloudflare R2,
    // Supabase Storage). Leave unset for real AWS S3.
    endpoint: process.env.STORAGE_ENDPOINT_URL || undefined,
    forcePathStyle: !!process.env.STORAGE_ENDPOINT_URL,
  });
  return cachedClient;
}

type Body = ArrayBuffer | ArrayBufferView | Buffer | Uint8Array | string;

function toUint8Array(body: Body): Uint8Array {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (Buffer.isBuffer(body)) return new Uint8Array(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  // ArrayBufferView (TypedArray that isn't Uint8Array) — wrap the buffer.
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}

/** PUT bytes at `key` with the given content type. Overwrites if it exists. */
export async function putObject(
  key: string,
  body: Body,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: key,
      Body: toUint8Array(body),
      ContentType: contentType,
    }),
  );
}

/** GET the bytes at `key` as a Buffer. */
export async function getObject(key: string): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }),
  );
  if (!res.Body) {
    throw new Error(`getObject failed (${key}): no body`);
  }
  // Body is a ReadableStream | Blob | Readable depending on the runtime.
  // transformToByteArray() is provided by @smithy/util-stream on all of them.
  const bytes = await (res.Body as { transformToByteArray: () => Promise<Uint8Array> })
    .transformToByteArray();
  return Buffer.from(bytes);
}

/** Mint a presigned GET URL valid for `expiresInSec` (default 1h). */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSec = 3600,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }),
    { expiresIn: expiresInSec },
  );
}

/**
 * Mint a presigned PUT URL clients can upload to directly. Used for the
 * mobile capture flow in Phase 3 — server-side code should prefer
 * `putObject`.
 *
 * S3 doesn't use an opaque "upload token" the way Supabase Storage
 * does, so `token` is empty and `path` echoes the key. Callers only
 * need `url` in practice.
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSec = 300,
): Promise<{ url: string; token: string; path: string }> {
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSec },
  );
  return { url, token: "", path: key };
}

/** Delete the object at `key`. No-op if it doesn't exist (S3 returns 204). */
export async function deleteObject(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }),
  );
}

// ─────────────────────────────────────────────────────────────
// Key helpers — single source of truth for the bucket layout.
// ─────────────────────────────────────────────────────────────

export const StorageKeys = {
  source: (clipId: string, ext = "mp4") => `sources/${clipId}.${ext}`,
  vertical: (clipId: string) => `verticals/${clipId}.mp4`,
  thumbnail: (clipId: string) => `thumbnails/${clipId}.jpg`,
  captions: (clipId: string) => `captions/${clipId}.json`,
};

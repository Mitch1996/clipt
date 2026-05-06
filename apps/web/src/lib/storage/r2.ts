import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Object storage facade.
 *
 * Today this talks to **Supabase Storage** (free tier, no card required)
 * — but the API surface mirrors the prompt-pack's R2 contract so we can
 * swap the implementation to Cloudflare R2 (S3-compatible) by replacing
 * the bodies in this file. Callers stay identical.
 *
 * Bucket layout (also documented in CLAUDE.md):
 *
 *   sources/{clipId}.{ext}         original source video
 *   verticals/{clipId}.mp4         9:16 export with burned captions
 *   thumbnails/{clipId}.jpg        poster frame
 *   captions/{clipId}.json         word-timed captions
 *
 * Reads go through signed URLs (`getSignedDownloadUrl`). Pipeline
 * writes use the service-role admin client which bypasses RLS.
 */

export const STORAGE_BUCKET = "clipt-media";

type Body = ArrayBuffer | ArrayBufferView | Blob | Buffer | string;

function storage() {
  return createAdminClient().storage.from(STORAGE_BUCKET);
}

/** PUT bytes at `key` with the given content type. Overwrites if it exists. */
export async function putObject(
  key: string,
  body: Body,
  contentType: string,
): Promise<void> {
  const blob =
    body instanceof Blob
      ? body
      : new Blob([body as BlobPart], { type: contentType });

  const { error } = await storage().upload(key, blob, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`putObject failed (${key}): ${error.message}`);
}

/** GET the bytes at `key` as a Buffer. */
export async function getObject(key: string): Promise<Buffer> {
  const { data, error } = await storage().download(key);
  if (error || !data) {
    throw new Error(`getObject failed (${key}): ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Mint a presigned GET URL valid for `expiresInSec` (default 1h). */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSec = 3600,
): Promise<string> {
  const { data, error } = await storage().createSignedUrl(key, expiresInSec);
  if (error || !data) {
    throw new Error(
      `getSignedDownloadUrl failed (${key}): ${error?.message ?? "no url"}`,
    );
  }
  return data.signedUrl;
}

/**
 * Mint a presigned PUT URL clients can upload to directly. Used for the
 * mobile capture flow in Phase 3 — server-side code should prefer
 * `putObject` so it doesn't pay the round-trip.
 */
export async function getSignedUploadUrl(
  key: string,
  // _contentType isn't enforced by Supabase Storage's signed-upload URL;
  // we keep it on the API for parity with the R2/S3 implementation that
  // DOES enforce it via the signed PutObject request.
  _contentType: string,
  // _expiresInSec: Supabase Storage doesn't currently honor a custom TTL
  // on signed-upload tokens (always ~2h). Kept for API parity.
  _expiresInSec = 300,
): Promise<{ url: string; token: string; path: string }> {
  const { data, error } = await storage().createSignedUploadUrl(key);
  if (error || !data) {
    throw new Error(
      `getSignedUploadUrl failed (${key}): ${error?.message ?? "no url"}`,
    );
  }
  return { url: data.signedUrl, token: data.token, path: data.path };
}

/** Delete the object at `key`. No-op if it doesn't exist. */
export async function deleteObject(key: string): Promise<void> {
  const { error } = await storage().remove([key]);
  if (error && !error.message.toLowerCase().includes("not found")) {
    throw new Error(`deleteObject failed (${key}): ${error.message}`);
  }
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

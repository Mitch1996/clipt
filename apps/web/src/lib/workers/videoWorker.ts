import "server-only";

import { SignJWT } from "jose";

/**
 * Typed client for the Python video worker (workers/video/).
 *
 * Each call signs a short-lived HS256 JWT with WORKER_HMAC_KEY and POSTs
 * to <VIDEO_WORKER_URL>/jobs/<name>. The worker enforces the same
 * audience claim (`clipt-video-worker`) and rejects anything else.
 *
 * Env vars:
 *   VIDEO_WORKER_URL  — public origin of the worker (Fly URL in prod,
 *                       http://localhost:8000 in dev)
 *   WORKER_HMAC_KEY   — base64 32 bytes; same value on both sides
 */

const AUDIENCE = "clipt-video-worker";
const LIVE_AUDIENCE = "clipt-live-worker";

function getWorkerEnv() {
  const url = process.env.VIDEO_WORKER_URL;
  const key = process.env.WORKER_HMAC_KEY;
  if (!url || !key) {
    throw new Error(
      "Video worker not configured: set VIDEO_WORKER_URL and WORKER_HMAC_KEY in .env.local",
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

function getLiveWorkerEnv() {
  const url = process.env.LIVE_WORKER_URL;
  const key = process.env.WORKER_HMAC_KEY;
  if (!url || !key) {
    throw new Error(
      "Live worker not configured: set LIVE_WORKER_URL and WORKER_HMAC_KEY in .env.local",
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function mintToken(audience: string = AUDIENCE): Promise<string> {
  const { key } = getWorkerEnv();
  // The worker's HMAC key is base64-encoded 32 bytes. jose's HS256
  // signer takes the raw bytes; we don't need to base64-decode the
  // value because python-jose will compare against the *string* form
  // it gets via os.environ. So both sides treat the value as an
  // opaque utf8 string and that matches.
  const secret = new TextEncoder().encode(key);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience(audience)
    .sign(secret);
}

async function callWorker<TIn, TOut>(path: string, body: TIn): Promise<TOut> {
  const { url } = getWorkerEnv();
  const token = await mintToken();
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `worker ${path} failed: ${res.status} ${text.slice(0, 300)}`,
    );
  }
  return (await res.json()) as TOut;
}

async function callLiveWorker<TIn, TOut>(path: string, body: TIn): Promise<TOut> {
  const { url } = getLiveWorkerEnv();
  const token = await mintToken(LIVE_AUDIENCE);
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `live-worker ${path} failed: ${res.status} ${text.slice(0, 300)}`,
    );
  }
  return (await res.json()) as TOut;
}

// ─── Typed methods (one per endpoint) ─────────────────────────────────

export interface TranscribeIn {
  clipId: string;
  sourceR2Key: string;
}
export interface TranscribeOut {
  captionsR2Key: string;
  language: string;
  wordCount: number;
  captionsJson: unknown;
}
export const callTranscribe = (input: TranscribeIn) =>
  callWorker<TranscribeIn, TranscribeOut>("/jobs/transcribe", input);

export interface ReframeIn {
  clipId: string;
  sourceR2Key: string;
  captionsR2Key?: string;
  style?: "default" | string;
  attributionToken?: string;
  creatorHandle?: string;
  /** Streamer-set override for the OBS face-cam position. */
  faceCamCorner?: "top_left" | "top_right" | "bottom_left" | "bottom_right";
}
export interface ReframeOut {
  verticalR2Key: string;
  thumbnailR2Key: string;
  width: number;
  height: number;
}
export const callReframe = (input: ReframeIn) =>
  callWorker<ReframeIn, ReframeOut>("/jobs/reframe", input);

export interface DownloadYouTubeIn {
  clipId: string;
  sourceUrl: string;
}
export interface DownloadYouTubeOut {
  sourceR2Key: string;
  durationSeconds: number;
  width: number;
  height: number;
}
export const callDownloadYouTube = (input: DownloadYouTubeIn) =>
  callWorker<DownloadYouTubeIn, DownloadYouTubeOut>(
    "/jobs/download-youtube",
    input,
  );

export interface HealthOut {
  status: "ok";
}
export async function callHealth(): Promise<HealthOut> {
  const { url } = getWorkerEnv();
  const res = await fetch(`${url}/healthz`);
  if (!res.ok) throw new Error(`worker /healthz failed: ${res.status}`);
  return (await res.json()) as HealthOut;
}

// ─── Live worker (Phase 2.2 chat → clip pipeline) ────────────────────

export interface StitchLiveWindowIn {
  channelId: string;
  channelLogin?: string;
  windowStartMs: number;
  windowEndMs: number;
  newClipId: string;
}
export interface StitchLiveWindowOut {
  sourceR2Key: string;
  durationSec: number;
  segmentCount: number;
  bytesTotal: number;
}
export const callStitchLiveWindow = (input: StitchLiveWindowIn) =>
  callLiveWorker<StitchLiveWindowIn, StitchLiveWindowOut>(
    "/jobs/stitch-live-window",
    input,
  );

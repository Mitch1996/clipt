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
  /** Channel-level cached corner passed straight through from
   *  channels.face_cam_corner. */
  faceCamCorner?: FaceCamCorner;
  /** Whether the streamer uses a VTuber avatar. Drives which
   *  post-render verification path runs. */
  isVtuber?: boolean;
}
export interface ReframeOut {
  verticalR2Key: string;
  thumbnailR2Key: string;
  width: number;
  height: number;
  /** Which corner the worker's internal fallback locked onto for this
   *  clip (only set when faceCamCorner was NOT supplied). */
  detectedCorner?: FaceCamCorner | null;
  /** Post-render verification result. Drives whether processClip /
   *  processCaptionEdit marks the clip ready or kicks the self-heal
   *  loop. */
  verificationStatus?: "passed" | "failed" | "skipped";
  /** Short reason string surfaced in admin triage. */
  verificationDetail?: string | null;
}
export const callReframe = (input: ReframeIn) =>
  callWorker<ReframeIn, ReframeOut>("/jobs/reframe", input);

export interface DetectFaceCamIn {
  /** Stored source mp4 in S3 (per-clip backstop). */
  sourceR2Key?: string;
  /** Direct URL (Twitch VOD HLS m3u8, or plain mp4). */
  sourceUrl?: string;
  /** Override the default 7 sample offsets if needed. */
  sampleOffsetsSec?: number[];
}
export type FaceCamCorner =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";
export interface DetectFaceCamOut {
  /** The consensus corner, or null when no corner reached the
   *  consensus floor (≥4 of 7 by default). */
  corner: FaceCamCorner | null;
  /** How many frames the model successfully scored. */
  framesSampled?: number;
  /** Per-corner vote counts (includes "none" votes). */
  votes?: Record<string, number>;
  /** winner_votes / total_votes (0.0–1.0). */
  confidence?: number;
}
export const callDetectFaceCam = (input: DetectFaceCamIn) =>
  callWorker<DetectFaceCamIn, DetectFaceCamOut>("/jobs/detect-face-cam", input);

// ─── VTuber classification ────────────────────────────────────────────

export interface ClassifyVtuberIn {
  /** Twitch VOD HLS URL (preferred — best variety of frames) OR a
   *  stored source mp4 key. */
  sourceUrl?: string;
  sourceR2Key?: string;
  /** Override the default 7 sample offsets. */
  sampleOffsetsSec?: number[];
}
export interface ClassifyVtuberOut {
  /** True = animated avatar (Live2D / VRoid / etc.), false = real
   *  human face on camera, null = inconclusive. */
  isVtuber: boolean | null;
  framesSampled?: number;
  confidence?: number;
}
export const callClassifyVtuber = (input: ClassifyVtuberIn) =>
  callWorker<ClassifyVtuberIn, ClassifyVtuberOut>("/jobs/classify-vtuber", input);

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

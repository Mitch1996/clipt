import "server-only";

import { SignJWT, importPKCS8 } from "jose";

/**
 * Verified-attribution signing — Clipt's differentiator.
 *
 * Every produced clip carries a JWT signed with our ed25519 private
 * key. The token's payload bundles the proof of origin: source channel,
 * original creator profile, source URL + time range, platform.
 * Anyone with the public key (published at
 * `/.well-known/clipt-attribution-public-key`) can verify it.
 *
 * Algorithm: EdDSA / Ed25519. The private key lives in
 * ATTRIBUTION_SIGNING_KEY as base64-encoded PKCS8 DER (generated with
 * `scripts/generate-attribution-key.mjs`).
 */

export const ATTRIBUTION_AUDIENCE = "clipt-attribution-v1";
export const ATTRIBUTION_ISSUER = "clipt.tv";
export const ATTRIBUTION_ALG = "EdDSA";

export interface AttributionPayload {
  /** UUID of the clip in our DB. */
  clipId: string;
  /** UUID of the row in `channels` (null if the source channel isn't on Clipt yet). */
  sourceChannelId: string | null;
  /** UUID of the original creator's profile (null until resolved). */
  originalCreatorProfileId: string | null;
  /** "twitch" | "youtube" | "kick" — where the source lives. */
  sourcePlatform: string;
  /** Canonical source URL we ingested from. */
  sourceUrl: string;
  /** Cut-window start, in seconds from the start of the source. */
  sourceStartSec: number;
  /** Cut-window end, in seconds from the start of the source. */
  sourceEndSec: number;
  /** ISO-8601 instant the signature was minted. */
  issuedAt: string;
}

/**
 * Mint a verified-attribution JWT for the given payload.
 *
 * Returns a compact JWS (the `xxx.yyy.zzz` form). Callers persist this
 * onto `clips.attribution_signature` and embed it in the rendered mp4
 * via ffmpeg's `-metadata clipt_attribution=<jwt>` (Prompt 1.10's
 * reframe step).
 */
export async function signAttribution(
  payload: AttributionPayload,
): Promise<string> {
  const privateKey = await loadPrivateKey();
  const claims: Record<string, unknown> = { ...payload };

  return new SignJWT(claims)
    .setProtectedHeader({ alg: ATTRIBUTION_ALG, typ: "JWT" })
    .setIssuer(ATTRIBUTION_ISSUER)
    .setAudience(ATTRIBUTION_AUDIENCE)
    .setIssuedAt(Math.floor(Date.parse(payload.issuedAt) / 1000) || undefined)
    .setSubject(payload.clipId)
    .sign(privateKey);
}

async function loadPrivateKey() {
  const raw = process.env.ATTRIBUTION_SIGNING_KEY;
  if (!raw) {
    throw new Error(
      "ATTRIBUTION_SIGNING_KEY is not set. Generate one with " +
        "`node scripts/generate-attribution-key.mjs --write` and paste the printed value into .env.local",
    );
  }

  // The env var is base64-encoded PKCS8 DER. importPKCS8 wants the
  // PEM-armored form, so wrap before importing.
  const pem =
    "-----BEGIN PRIVATE KEY-----\n" +
    raw.match(/.{1,64}/g)!.join("\n") +
    "\n-----END PRIVATE KEY-----";

  return importPKCS8(pem, ATTRIBUTION_ALG);
}

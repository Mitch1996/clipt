import { importJWK, jwtVerify, type JWK } from "jose";

import {
  ATTRIBUTION_ALG,
  ATTRIBUTION_AUDIENCE,
  ATTRIBUTION_ISSUER,
  type AttributionPayload,
} from "./sign";

/**
 * Verify a Clipt attribution JWT.
 *
 * Checks signature against any public key currently published in our
 * JWKS, plus the `aud` and `iss` claims. Returns the typed payload on
 * success, throws on any mismatch.
 *
 * Safe to run from anywhere — the public-key lookup goes through the
 * `/.well-known/clipt-attribution-public-keys.json` JWKS endpoint.
 * Callers can pass an explicit JWKS for offline verification or for
 * tests.
 */
export interface VerifyOptions {
  /** Override JWKS source. Default: fetch from `${baseUrl}/.well-known/...` */
  jwks?: { keys: JWK[] };
  /** Base URL to fetch the JWKS from. Default: NEXT_PUBLIC_APP_URL. */
  baseUrl?: string;
}

export interface VerifiedAttribution {
  payload: AttributionPayload;
  /** Key ID that verified the signature, if present in the JWT header. */
  kid: string | undefined;
  /** Issuer + audience as declared in the token. */
  iss: string;
  aud: string;
}

export async function verifyAttribution(
  token: string,
  options: VerifyOptions = {},
): Promise<VerifiedAttribution> {
  const jwks = options.jwks ?? (await fetchJwks(options.baseUrl));

  // Try each key. jose's createRemoteJWKSet would do this for us, but
  // it caches HTTP-style and isn't ergonomic for tests, so we walk the
  // array manually.
  let lastError: unknown = null;
  for (const jwk of jwks.keys) {
    try {
      const key = await importJWK(jwk, ATTRIBUTION_ALG);
      const { payload, protectedHeader } = await jwtVerify(token, key, {
        audience: ATTRIBUTION_AUDIENCE,
        issuer: ATTRIBUTION_ISSUER,
        algorithms: [ATTRIBUTION_ALG],
      });

      return {
        payload: extractPayload(payload),
        kid: protectedHeader.kid,
        iss: payload.iss as string,
        aud: payload.aud as string,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Attribution verification failed: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function fetchJwks(baseUrl?: string): Promise<{ keys: JWK[] }> {
  const origin = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    throw new Error(
      "verifyAttribution: pass options.jwks or set NEXT_PUBLIC_APP_URL so we can fetch the JWKS",
    );
  }
  const res = await fetch(
    `${origin.replace(/\/$/, "")}/.well-known/clipt-attribution-public-keys.json`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`JWKS fetch failed: ${res.status}`);
  }
  return (await res.json()) as { keys: JWK[] };
}

function extractPayload(claims: Record<string, unknown>): AttributionPayload {
  // Type-narrow the JWT claims into the typed payload shape. The
  // claims also include iss/aud/iat/sub which we ignore here — they're
  // surfaced separately on VerifiedAttribution.
  return {
    clipId: String(claims.clipId ?? claims.sub),
    sourceChannelId:
      claims.sourceChannelId === null ? null : (claims.sourceChannelId as string | null),
    originalCreatorProfileId:
      claims.originalCreatorProfileId === null
        ? null
        : (claims.originalCreatorProfileId as string | null),
    sourcePlatform: String(claims.sourcePlatform),
    sourceUrl: String(claims.sourceUrl),
    sourceStartSec: Number(claims.sourceStartSec),
    sourceEndSec: Number(claims.sourceEndSec),
    issuedAt: String(claims.issuedAt),
  };
}

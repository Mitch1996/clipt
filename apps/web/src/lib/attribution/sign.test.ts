import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";

import {
  ATTRIBUTION_AUDIENCE,
  ATTRIBUTION_ISSUER,
  signAttribution,
  type AttributionPayload,
} from "./sign";
import { verifyAttribution } from "./verify";

const SAMPLE: AttributionPayload = {
  clipId: "11111111-1111-1111-1111-111111111111",
  sourceChannelId: "22222222-2222-2222-2222-222222222222",
  originalCreatorProfileId: "33333333-3333-3333-3333-333333333333",
  sourcePlatform: "twitch",
  sourceUrl: "https://www.twitch.tv/shroud/clip/SomeSlug",
  sourceStartSec: 0,
  sourceEndSec: 30,
  issuedAt: "2026-05-06T00:00:00.000Z",
};

let savedKey: string | undefined;

beforeAll(async () => {
  // Sub in a fresh keypair so the test doesn't depend on developer env.
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });

  const pkcs8Pem = await exportPKCS8(privateKey);
  const der = Buffer.from(
    pkcs8Pem
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s+/g, ""),
    "base64",
  );
  savedKey = process.env.ATTRIBUTION_SIGNING_KEY;
  process.env.ATTRIBUTION_SIGNING_KEY = der.toString("base64");

  // Stash the matching JWK for the verify path (avoids HTTP fetch).
  const { exportJWK } = await import("jose");
  const jwk = await exportJWK(publicKey);
  jwk.alg = "EdDSA";
  jwk.use = "sig";
  jwk.kid = "test-key";
  testJwks = { keys: [jwk] };
});

afterAll(() => {
  process.env.ATTRIBUTION_SIGNING_KEY = savedKey;
});

let testJwks: { keys: import("jose").JWK[] } = { keys: [] };

describe("attribution sign + verify", () => {
  test("round-trips a payload through ed25519", async () => {
    const token = await signAttribution(SAMPLE);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const verified = await verifyAttribution(token, { jwks: testJwks });
    expect(verified.payload).toEqual(SAMPLE);
    expect(verified.iss).toBe(ATTRIBUTION_ISSUER);
    expect(verified.aud).toBe(ATTRIBUTION_AUDIENCE);
  });

  test("rejects a token signed with a different key", async () => {
    const otherKey = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });
    const otherPem = await exportPKCS8(otherKey.privateKey);
    const otherDer = Buffer.from(
      otherPem
        .replace(/-----BEGIN PRIVATE KEY-----/, "")
        .replace(/-----END PRIVATE KEY-----/, "")
        .replace(/\s+/g, ""),
      "base64",
    );

    const original = process.env.ATTRIBUTION_SIGNING_KEY;
    process.env.ATTRIBUTION_SIGNING_KEY = otherDer.toString("base64");
    const tokenFromOther = await signAttribution(SAMPLE);
    process.env.ATTRIBUTION_SIGNING_KEY = original;

    await expect(
      verifyAttribution(tokenFromOther, { jwks: testJwks }),
    ).rejects.toThrow();
  });

  test("rejects a tampered token", async () => {
    const token = await signAttribution(SAMPLE);
    // Flip the last char of the signature segment.
    const parts = token.split(".");
    const sig = parts[2];
    const tampered =
      parts[0] +
      "." +
      parts[1] +
      "." +
      sig.slice(0, -1) +
      (sig.endsWith("A") ? "B" : "A");

    await expect(
      verifyAttribution(tampered, { jwks: testJwks }),
    ).rejects.toThrow();
  });

  test("rejects a token with the wrong audience", async () => {
    // Sign manually with the wrong aud and verify our gate catches it.
    const { SignJWT, importPKCS8 } = await import("jose");
    const pem =
      "-----BEGIN PRIVATE KEY-----\n" +
      process
        .env.ATTRIBUTION_SIGNING_KEY!.match(/.{1,64}/g)!
        .join("\n") +
      "\n-----END PRIVATE KEY-----";
    const key = await importPKCS8(pem, "EdDSA");
    const wrongAudToken = await new SignJWT({ ...SAMPLE })
      .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
      .setIssuer(ATTRIBUTION_ISSUER)
      .setAudience("not-clipt")
      .sign(key);

    await expect(
      verifyAttribution(wrongAudToken, { jwks: testJwks }),
    ).rejects.toThrow();
  });
});

describe("publish convention", () => {
  test("/.well-known/clipt-attribution-public-key file is valid JWK", () => {
    const path = join(
      process.cwd(),
      "public/.well-known/clipt-attribution-public-key",
    );
    const raw = readFileSync(path, "utf8");
    const jwk = JSON.parse(raw);
    expect(jwk.kty).toBe("OKP");
    expect(jwk.crv).toBe("Ed25519");
    expect(jwk.alg).toBe("EdDSA");
    expect(jwk.x).toBeTruthy();
  });

  test("/.well-known/clipt-attribution-public-keys.json is a valid JWKS", () => {
    const path = join(
      process.cwd(),
      "public/.well-known/clipt-attribution-public-keys.json",
    );
    const jwks = JSON.parse(readFileSync(path, "utf8"));
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);
    const current = jwks.keys.find((k: { validUntil: unknown }) => k.validUntil === null);
    expect(current).toBeDefined();
  });
});

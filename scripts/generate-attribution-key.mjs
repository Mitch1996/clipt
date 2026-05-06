#!/usr/bin/env node
/**
 * Generate an Ed25519 keypair for the attribution signing system.
 *
 * Outputs:
 *   - private key as base64-encoded PKCS8 DER (paste into .env.local
 *     as ATTRIBUTION_SIGNING_KEY)
 *   - public key as a JWK + an entry to add to the JWKS file
 *
 * The matching public-key files live at:
 *   apps/web/public/.well-known/clipt-attribution-public-key
 *   apps/web/public/.well-known/clipt-attribution-public-keys.json
 *
 * Usage:
 *   node scripts/generate-attribution-key.mjs              -> just print
 *   node scripts/generate-attribution-key.mjs --write       -> also write
 *                                                              the public-key
 *                                                              files (rotates
 *                                                              the JWKS array)
 */
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WELL_KNOWN_DIR = "apps/web/public/.well-known";
const SINGLE_KEY_PATH = join(WELL_KNOWN_DIR, "clipt-attribution-public-key");
const JWKS_PATH = join(WELL_KNOWN_DIR, "clipt-attribution-public-keys.json");

const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
  crv: "Ed25519",
  extractable: true,
});

const pkcs8 = await exportPKCS8(privateKey);
// Convert PEM → base64 DER for compact env-var storage.
const der = Buffer.from(
  pkcs8
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, ""),
  "base64",
);
const privateKeyB64 = der.toString("base64");

const publicJwk = await exportJWK(publicKey);
publicJwk.alg = "EdDSA";
publicJwk.use = "sig";
publicJwk.kid = `clipt-attr-${new Date().toISOString().slice(0, 10)}`;

console.log("=== ATTRIBUTION_SIGNING_KEY (paste into .env.local) ===");
console.log(privateKeyB64);
console.log();
console.log("=== Public key (JWK) ===");
console.log(JSON.stringify(publicJwk, null, 2));

if (process.argv.includes("--write")) {
  mkdirSync(WELL_KNOWN_DIR, { recursive: true });
  writeFileSync(SINGLE_KEY_PATH, JSON.stringify(publicJwk, null, 2) + "\n");

  const now = new Date().toISOString();
  const newEntry = { ...publicJwk, validFrom: now, validUntil: null };

  let jwks = { keys: [] };
  if (existsSync(JWKS_PATH)) {
    jwks = JSON.parse(readFileSync(JWKS_PATH, "utf8"));
    // Mark previous current key as retired.
    jwks.keys = jwks.keys.map((k) =>
      k.validUntil === null ? { ...k, validUntil: now } : k,
    );
  }
  jwks.keys.unshift(newEntry);
  writeFileSync(JWKS_PATH, JSON.stringify(jwks, null, 2) + "\n");

  console.log(`\nWrote ${SINGLE_KEY_PATH}`);
  console.log(`Wrote ${JWKS_PATH}`);
}

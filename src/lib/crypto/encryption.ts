import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits is the GCM-recommended IV size
const AUTH_TAG_LENGTH = 16; // GCM auth tag is always 128 bits

function getKey(rawKey?: string): Buffer {
  const value = rawKey ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!value) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const buf = Buffer.from(value, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${buf.length}`,
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Output format: base64( iv (12 bytes) || ciphertext || authTag (16 bytes) ).
 *
 * Empty plaintext is allowed and returns an empty string — callers can
 * treat empty ciphertext as "no token stored".
 */
export function encrypt(plaintext: string, rawKey?: string): string {
  if (plaintext === "") return "";

  const key = getKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

/**
 * Decrypt a ciphertext produced by `encrypt()`. Throws on malformed input
 * or auth-tag mismatch (which means the ciphertext was tampered with OR
 * encrypted with a different key).
 */
export function decrypt(ciphertextB64: string, rawKey?: string): string {
  if (ciphertextB64 === "") return "";

  const key = getKey(rawKey);
  const buf = Buffer.from(ciphertextB64, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("ciphertext too short");
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}

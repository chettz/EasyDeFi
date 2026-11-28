import "server-only";

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 2 ** 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function createSalt() {
  return randomBytes(16).toString("base64url");
}

function derivePinHash(pin: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(pin, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPaymentPin(pin: string, salt: string) {
  return (await derivePinHash(pin, salt)).toString("base64url");
}

export async function paymentPinMatches(pin: string, salt: string, expectedHash: string) {
  try {
    const actual = Buffer.from(await hashPaymentPin(pin, salt), "base64url");
    const expected = Buffer.from(expectedHash, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createGrantToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashGrantToken(token) };
}

export function hashGrantToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

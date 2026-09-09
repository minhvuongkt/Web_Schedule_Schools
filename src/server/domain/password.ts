import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (memory-hard KDF).
 *
 * Deviation from docs/architecture.md (argon2id): the argon2 npm package is
 * a native module and `npm install` is currently blocked on this machine by
 * dead-SID-owned files inside node_modules (see docs/implementation-audit
 * notes). scrypt is the OWASP-approved fallback; parameters below match the
 * OWASP cheat sheet minimums. Switch to argon2id (same verify-interface)
 * once node_modules is repaired.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Format: scrypt$N$r$p$<salt base64>$<derived key base64> */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/** Constant-time verification; returns false for malformed stored hashes. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  try {
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    const actual = scryptSync(password, salt, expected.length, { N: n, r, p });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

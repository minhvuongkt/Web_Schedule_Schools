import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Email verification codes (pure rules + hashing), shared by the onboarding
 * wizard, account email change and the forgot-password flow. A code is a
 * 6-digit one-time value bound to (purpose, email); only its HMAC is stored.
 */

export const VERIFICATION_PURPOSES = [
  "ONBOARDING",
  "EMAIL_CHANGE",
  "PASSWORD_RESET",
] as const;

export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_INTERVAL_MS = 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

export function isVerificationPurpose(value: string): value is VerificationPurpose {
  return (VERIFICATION_PURPOSES as readonly string[]).includes(value);
}

/** Cryptographically random zero-padded numeric code, e.g. "042317". */
export function generateVerificationCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH)
    .toString()
    .padStart(CODE_LENGTH, "0");
}

/** Users may paste codes with spaces or dashes; keep digits only. */
export function normalizeVerificationCode(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidVerificationCodeFormat(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}

/** Deterministic HMAC binding the code to purpose + email (never stored raw). */
export function hashVerificationCode(
  secret: string,
  purpose: VerificationPurpose,
  email: string,
  code: string,
): string {
  return createHmac("sha256", secret)
    .update(`${purpose}:${email}:${code}`)
    .digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function verificationHashesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  return (
    bufferA.length > 0 &&
    bufferA.length === bufferB.length &&
    timingSafeEqual(bufferA, bufferB)
  );
}

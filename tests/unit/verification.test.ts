import { describe, expect, it } from "vitest";

import {
  CODE_LENGTH,
  generateVerificationCode,
  hashVerificationCode,
  isVerificationPurpose,
  isValidVerificationCodeFormat,
  normalizeVerificationCode,
  verificationHashesMatch,
} from "@/server/domain/verification";

describe("generateVerificationCode", () => {
  it("always produces a zero-padded numeric code of CODE_LENGTH", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVerificationCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(/^\d+$/);
    }
  });
});

describe("normalizeVerificationCode", () => {
  it("keeps digits only, so pasted spaces/dashes still work", () => {
    expect(normalizeVerificationCode(" 042 317 ")).toBe("042317");
    expect(normalizeVerificationCode("042-317")).toBe("042317");
    expect(normalizeVerificationCode("abc123def456")).toBe("123456");
  });
});

describe("isValidVerificationCodeFormat", () => {
  it("requires exactly CODE_LENGTH digits", () => {
    expect(isValidVerificationCodeFormat("000000")).toBe(true);
    expect(isValidVerificationCodeFormat("123456")).toBe(true);
    expect(isValidVerificationCodeFormat("12345")).toBe(false);
    expect(isValidVerificationCodeFormat("1234567")).toBe(false);
    expect(isValidVerificationCodeFormat("12345a")).toBe(false);
    expect(isValidVerificationCodeFormat("")).toBe(false);
  });
});

describe("hashVerificationCode", () => {
  const secret = "test-secret";

  it("is deterministic for the same inputs", () => {
    const a = hashVerificationCode(secret, "PASSWORD_RESET", "a@b.vn", "123456");
    const b = hashVerificationCode(secret, "PASSWORD_RESET", "a@b.vn", "123456");
    expect(a).toBe(b);
  });

  it("binds the hash to code, purpose, email and secret", () => {
    const base = hashVerificationCode(secret, "PASSWORD_RESET", "a@b.vn", "123456");
    expect(hashVerificationCode(secret, "PASSWORD_RESET", "a@b.vn", "123457")).not.toBe(base);
    expect(hashVerificationCode(secret, "ONBOARDING", "a@b.vn", "123456")).not.toBe(base);
    expect(hashVerificationCode(secret, "PASSWORD_RESET", "c@b.vn", "123456")).not.toBe(base);
    expect(hashVerificationCode("another-secret", "PASSWORD_RESET", "a@b.vn", "123456")).not.toBe(base);
  });
});

describe("verificationHashesMatch", () => {
  it("accepts equal digests and rejects different or malformed ones", () => {
    const digest = hashVerificationCode("s", "ONBOARDING", "a@b.vn", "111111");
    expect(verificationHashesMatch(digest, digest)).toBe(true);
    expect(
      verificationHashesMatch(
        digest,
        hashVerificationCode("s", "ONBOARDING", "a@b.vn", "222222"),
      ),
    ).toBe(false);
    expect(verificationHashesMatch(digest, "")).toBe(false);
    expect(verificationHashesMatch("", "")).toBe(false);
  });
});

describe("isVerificationPurpose", () => {
  it("accepts only the supported purposes", () => {
    expect(isVerificationPurpose("ONBOARDING")).toBe(true);
    expect(isVerificationPurpose("EMAIL_CHANGE")).toBe(true);
    expect(isVerificationPurpose("PASSWORD_RESET")).toBe(true);
    expect(isVerificationPurpose("LOGIN")).toBe(false);
    expect(isVerificationPurpose("")).toBe(false);
  });
});

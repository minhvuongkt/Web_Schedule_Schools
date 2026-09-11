import { describe, expect, it } from "vitest";

import {
  EMAIL_MAX_LENGTH,
  normalizeEmail,
  validateEmailAddress,
  validateEmailConfirmation,
  validateNewPassword,
} from "@/server/domain/credentials";

describe("validateEmailAddress", () => {
  it("accepts common school addresses", () => {
    expect(validateEmailAddress("ten@truong.edu.vn").ok).toBe(true);
    expect(validateEmailAddress("  Giao.Vien01@mangcanh.edu.vn ").ok).toBe(true);
  });

  it("rejects empty, malformed and overlong addresses", () => {
    expect(validateEmailAddress("").ok).toBe(false);
    expect(validateEmailAddress("khong-co-a-cong").ok).toBe(false);
    expect(validateEmailAddress("a@b").ok).toBe(false);
    expect(validateEmailAddress("a b@c.vn").ok).toBe(false);
    expect(validateEmailAddress(`${"x".repeat(EMAIL_MAX_LENGTH)}@a.vn`).ok).toBe(false);
  });
});

describe("validateEmailConfirmation", () => {
  it("compares case-insensitively after trimming", () => {
    expect(validateEmailConfirmation("Ten@Truong.vn", " ten@truong.vn ").ok).toBe(true);
    expect(validateEmailConfirmation("a@b.vn", "c@b.vn").ok).toBe(false);
  });
});

describe("validateNewPassword", () => {
  it("requires at least 8 characters and a matching confirmation", () => {
    expect(validateNewPassword("matkhau123", "matkhau123").ok).toBe(true);
    expect(validateNewPassword("ngan", "ngan").ok).toBe(false);
    expect(validateNewPassword("matkhau123", "matkhau124").ok).toBe(false);
  });

  it("rejects overlong passwords", () => {
    const long = "x".repeat(129);
    expect(validateNewPassword(long, long).ok).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  ABC@Truong.VN ")).toBe("abc@truong.vn");
  });
});

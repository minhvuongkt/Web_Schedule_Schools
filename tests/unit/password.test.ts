import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/domain/password";

describe("password (scrypt)", () => {
  it("hash/verify roundtrip", () => {
    const hash = hashPassword("Dev@12345");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Dev@12345", hash)).toBe(true);
  });

  it("rejects wrong passwords", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("", hash)).toBe(false);
  });

  it("salts are unique per hash", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password", a)).toBe(true);
    expect(verifyPassword("same-password", b)).toBe(true);
  });

  it("returns false for malformed stored hashes", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$a$b$c$d$e")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});

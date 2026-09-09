import { describe, expect, it } from "vitest";
import { diacriticFreeKey } from "@/server/domain/normalize";

/**
 * Search normalization contract (spec §21): queries must match Vietnamese
 * text without diacritics — "toan" finds "Toán", "nguyen thi" finds
 * "Nguyễn Thị", "8a" finds "8A".
 */
describe("search diacritics normalization", () => {
  it("folds diacritics for subject matching", () => {
    expect(diacriticFreeKey("Toán").includes(diacriticFreeKey("toan"))).toBe(true);
    expect(diacriticFreeKey("Ngữ văn").includes(diacriticFreeKey("ngu van"))).toBe(true);
    expect(diacriticFreeKey("Giáo dục thể chất").includes(diacriticFreeKey("gdtt"))).toBe(false);
    expect(diacriticFreeKey("Giáo dục thể chất").includes(diacriticFreeKey("the chat"))).toBe(true);
  });

  it("folds diacritics for teacher name matching", () => {
    expect(diacriticFreeKey("Nguyễn Thị Hoài Tâm").includes(diacriticFreeKey("nguyen thi"))).toBe(true);
    expect(diacriticFreeKey("Trần Anh Khoa").includes(diacriticFreeKey("tran anh"))).toBe(true);
    // the apostrophe is preserved in the key (significant in Bahnar names):
    expect(diacriticFreeKey("Y H'Phươn").includes("h'phuon")).toBe(true);
  });

  it("case-insensitive class-code matching", () => {
    expect(diacriticFreeKey("8A").includes(diacriticFreeKey("8a"))).toBe(true);
    expect(diacriticFreeKey("9B").includes(diacriticFreeKey("9"))).toBe(true);
  });

  it("produces the same key for typographic and ASCII apostrophes", () => {
    expect(diacriticFreeKey("Y H’Phươn")).toBe(diacriticFreeKey("Y H'Phươn"));
  });
});

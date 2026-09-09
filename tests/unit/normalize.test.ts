import { describe, expect, it } from "vitest";
import {
  diacriticFreeKey,
  foldApostrophes,
  normalizeName,
  normalizeWhitespace,
  vietnameseEquals,
} from "@/server/domain/normalize";

describe("foldApostrophes", () => {
  it("folds the typographic apostrophe to ASCII", () => {
    expect(foldApostrophes("Y H’Phươn")).toBe("Y H'Phươn");
  });

  it("folds other single-quote variants", () => {
    expect(foldApostrophes("Y HʼPhươn")).toBe("Y H'Phươn");
  });

  it("leaves text without apostrophe variants untouched", () => {
    expect(foldApostrophes("Nguyễn Thị Vân")).toBe("Nguyễn Thị Vân");
  });
});

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeWhitespace("  Trần   Anh  Khoa ")).toBe("Trần Anh Khoa");
  });
});

describe("normalizeName", () => {
  it("folds apostrophes and collapses whitespace", () => {
    expect(normalizeName("  Y  H’Phươn ")).toBe("Y H'Phươn");
  });
});

describe("vietnameseEquals", () => {
  it("matches ignoring case and diacritics", () => {
    expect(vietnameseEquals("toan", "Toán")).toBe(true);
    expect(vietnameseEquals("NGỮ VĂN", "ngu van")).toBe(true);
  });

  it("folds apostrophe variants before comparing", () => {
    expect(vietnameseEquals("Y H’Phươn", "Y H'Phươn")).toBe(true);
  });

  it("rejects different words", () => {
    expect(vietnameseEquals("toan", "van")).toBe(false);
  });
});

describe("diacriticFreeKey", () => {
  it("is stable across case, diacritics, spacing and apostrophe variants", () => {
    expect(diacriticFreeKey("Toán")).toBe(diacriticFreeKey("toan"));
    expect(diacriticFreeKey("Y H’Phươn")).toBe(diacriticFreeKey("y h'phươn"));
    expect(diacriticFreeKey("C. Tâm")).toBe(diacriticFreeKey("c. TÂM"));
  });

  it("produces a lowercase, diacritic-free, whitespace-collapsed key", () => {
    expect(diacriticFreeKey("  Trần   Anh  Khoa ")).toBe("tran anh khoa");
    expect(diacriticFreeKey("Ngữ văn")).toBe("ngu van");
  });

  it("is deterministic for the same input", () => {
    expect(diacriticFreeKey("Đặng Thị Tuyết Đông")).toBe(diacriticFreeKey("Đặng Thị Tuyết Đông"));
  });
});

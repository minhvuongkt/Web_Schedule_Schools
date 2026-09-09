/**
 * Text normalization shared by the seed, the Excel import pipeline and the
 * conflict/workload engines. Vietnamese source data (PCPN/TKB workbooks)
 * contains typographic apostrophes and inconsistent spacing that would
 * otherwise split one person into two identities (see
 * database/fixtures/week1/README.md, finding "Name normalization matters").
 */

/** Fold typographic/single-quote variants to the ASCII apostrophe. */
export function foldApostrophes(value: string): string {
  return value.replace(/[\u2019\u2018\u02BC\u0060\u00B4]/g, "'");
}

/** Collapse runs of whitespace and trim. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Canonical person/label form: apostrophes folded, whitespace collapsed. */
export function normalizeName(value: string): string {
  return normalizeWhitespace(foldApostrophes(value));
}

/**
 * Case- and diacritic-insensitive comparison key for Vietnamese search
 * ("toan" matches "Toán", "ngu van" matches "Ngữ văn"). Composed characters
 * are decomposed (NFD), combining marks removed, then lowercased and
 * apostrophes folded so "H'Phươn" matches "H’Phươn".
 */
export function diacriticFreeKey(value: string): string {
  return foldApostrophes(
    normalizeWhitespace(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  ).toLowerCase();
}

/** True when two Vietnamese strings are equal ignoring case and diacritics. */
export function vietnameseEquals(a: string, b: string): boolean {
  return diacriticFreeKey(a) === diacriticFreeKey(b);
}

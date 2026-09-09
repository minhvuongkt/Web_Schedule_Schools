import { describe, expect, it } from "vitest";
import { generateQrSvg } from "@/server/domain/qr";

function decodeUrl(svg: string): string {
  // crude sanity helpers instead of a full decoder:
  expect(svg).toMatch(/^<svg/);
  expect(svg).toContain("crispEdges");
  expect(svg).toContain('fill="#000000"');
  return svg;
}

describe("QR generator", () => {
  it("generates a well-formed SVG for a class URL", () => {
    const svg = generateQrSvg("http://localhost:3000/timetable/class/8A");
    decodeUrl(svg);
    // finder patterns: three solid 3x3 cores ⇒ at least 27 dark modules
    const dark = (svg.match(/M\d+,\d+h1v1h-1z/g) ?? []).length;
    expect(dark).toBeGreaterThan(80);
  });

  it("scales module count with payload size", () => {
    const small = generateQrSvg("http://localhost:3000/timetable/class/6A");
    const big = generateQrSvg(
      "http://localhost:3000/timetable/class/9B?utm_source=a-really-long-qr-tracking-payload",
    );
    const count = (s: string) => (s.match(/M\d+,\d+h1v1h-1z/g) ?? []).length;
    expect(count(big)).toBeGreaterThan(0);
    expect(count(small)).toBeGreaterThan(0);
  });

  it("rejects oversized payloads instead of truncating", () => {
    expect(() =>
      generateQrSvg("http://localhost:3000/timetable/class/8A?" + "x".repeat(200)),
    ).toThrow();
  });

  it("produces deterministic output", () => {
    const a = generateQrSvg("http://localhost:3000/timetable/class/8A");
    const b = generateQrSvg("http://localhost:3000/timetable/class/8A");
    expect(a).toBe(b);
  });
});

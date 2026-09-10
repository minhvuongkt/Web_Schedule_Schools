/**
 * Unit tests for the pure Excel TKB parser/mapper
 * (src/server/domain/excel-parse.ts).
 *
 * Two layers:
 * 1. Synthetic small grids — layout rules (header/footer rows, session and
 *    period state machine, PERIOD_INFERRED, DATE_RANGE_MISMATCH, mapping
 *    issues, alias variants).
 * 2. The REAL workbook regression — database/fixtures/week1/source/
 *    week1_schedule.xls must reproduce the verified 236-entry Week 01
 *    fixture exactly (database/fixtures/week1/README.md findings).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  findDuplicateSlots,
  findTkbSheet,
  insertLabel,
  labelVariants,
  mapEntries,
  parseTkbSheet,
  suggestLabels,
  type ClassRef,
  type ParseResult,
  type ParsedTkbEntry,
  type SubjectRef,
  type TeacherRef,
  type TkbMapContext,
} from "@/server/domain/excel-parse";
import { normalizeName } from "@/server/domain/normalize";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixtureDir = path.resolve("database/fixtures/week1");

interface FixtureEntry {
  day: number;
  date: string;
  session: string;
  period: number;
  periodInferred: boolean;
  classCode: string;
  subjectLabel: string;
  subjectCode: string;
  teacherAlias: string;
  teacherName: string;
  sourceRow: number;
}

interface FixtureSubject {
  code: string;
  name: string;
  component: string | null;
  observedLabels: string[];
}

interface FixtureSummary {
  entryCount: number;
  entriesWithInferredPeriod: number;
}

const entriesFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "timetable-entries.json"), "utf8"),
) as { classes: string[]; entries: FixtureEntry[] };
const teachersFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "teachers.json"), "utf8"),
) as { fullName: string }[];
const aliasesFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "teacher-aliases.json"), "utf8"),
) as { aliases: Record<string, string> };
const subjectsFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "subjects.json"), "utf8"),
) as FixtureSubject[];
const summaryFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "summary.json"), "utf8"),
) as FixtureSummary;

// ---------------------------------------------------------------------------
// Synthetic context builder
// ---------------------------------------------------------------------------

function buildContext(): TkbMapContext {
  const classesByCode = new Map<string, ClassRef>();
  for (const code of entriesFixture.classes) {
    insertLabel(classesByCode, code, { id: `cls:${code}`, code });
  }

  const teachersByAlias = new Map<string, TeacherRef>();
  for (const teacher of teachersFixture) {
    const fullName = normalizeName(teacher.fullName);
    insertLabel(teachersByAlias, fullName, { id: fullName, code: "", fullName });
  }
  for (const [alias, fullName] of Object.entries(aliasesFixture.aliases)) {
    const normalized = normalizeName(fullName);
    insertLabel(teachersByAlias, alias, { id: normalized, code: "", fullName: normalized });
  }

  const subjectsByLabel = new Map<string, SubjectRef>();
  for (const subject of subjectsFixture) {
    const ref: SubjectRef = {
      subjectId: subject.code,
      subjectComponentId: subject.component ?? null,
    };
    for (const label of subject.observedLabels) insertLabel(subjectsByLabel, label, ref);
  }

  return { classesByCode, teachersByAlias, subjectsByLabel };
}

// ---------------------------------------------------------------------------
// Synthetic grids
// ---------------------------------------------------------------------------

const SYNTHETIC_GRID: unknown[][] = [
  ["TRƯỜNG THỬ NGHIỆM MĂNG CÀNH", null, null, null, null, null, null, null, null],
  [null, null, "THỜI KHÓA BIỂU TUẦN 01 NĂM HỌC 2026-2027"],
  [null, null, "(Áp dụng từ ngày 07 tháng 9 năm 2026 đến ngày 11 tháng 9 năm 2026)"],
  ["Thứ", "Buổi", "Tiết", "Lớp 6A", null, "Lớp 6B", null, "Lớp 7A", null],
  [null, null, null, "Môn", "GV thực hiên", "Môn", "GV thực hiên", "Môn", "GV thực hiên"],
  ["Thứ 2", "S", "1", "Toán", "C.Mai", "Văn", "C. Lan", "KHTN(L)", "T.Nam"],
  [null, null, "2", "Toán", "C. Mai", null, null, null, null],
  [null, null, null, "GDTC", "T.Nam", null, null, null, null],
  [null, "C", "1", null, null, "Toán", "C.Mai", "Văn", "C. Lan"],
  ["Thứ 7", "Sáng", "1", "Văn", "C. Lan", "Toán", "C.Mai", "Toán", "C.Mai"],
  [null, null, "2", null, null, null, null, null, null],
  [null, null, "HIỆU TRƯỞNG", null, "Măng Đen, ngày 06 tháng 9 năm 2026"],
  [null, null, null, null, "Nguyễn Viết Trung"],
];

function sheetFromGrid(grid: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(grid);
}

// A minimal context for the synthetic grid (only the labels it uses).
function syntheticContext(): TkbMapContext {
  const classesByCode = new Map<string, ClassRef>();
  insertLabel(classesByCode, "6A", { id: "cls:6A", code: "6A" });
  insertLabel(classesByCode, "6B", { id: "cls:6B", code: "6B" });
  insertLabel(classesByCode, "7A", { id: "cls:7A", code: "7A" });

  const teachersByAlias = new Map<string, TeacherRef>();
  insertLabel(teachersByAlias, "Trần Thị Mai", { id: "t-mai", code: "T01", fullName: "Trần Thị Mai" });
  insertLabel(teachersByAlias, "C.Mai", { id: "t-mai", code: "T01", fullName: "Trần Thị Mai" });
  insertLabel(teachersByAlias, "Lê Văn Lan", { id: "t-lan", code: "T02", fullName: "Lê Văn Lan" });
  insertLabel(teachersByAlias, "C. Lan", { id: "t-lan", code: "T02", fullName: "Lê Văn Lan" });
  insertLabel(teachersByAlias, "Nam Sơn", { id: "t-nam", code: "T03", fullName: "Nam Sơn" });
  insertLabel(teachersByAlias, "T.Nam", { id: "t-nam", code: "T03", fullName: "Nam Sơn" });

  const subjectsByLabel = new Map<string, SubjectRef>();
  insertLabel(subjectsByLabel, "Toán", { subjectId: "MATHEMATICS", subjectComponentId: null });
  insertLabel(subjectsByLabel, "Văn", { subjectId: "LITERATURE", subjectComponentId: null });
  insertLabel(subjectsByLabel, "GDTC", { subjectId: "PHYSICAL_EDUCATION", subjectComponentId: null });
  insertLabel(subjectsByLabel, "KHTN(L)", { subjectId: "NS_PHYSICS", subjectComponentId: "PHYSICS" });

  return { classesByCode, teachersByAlias, subjectsByLabel };
}

describe("excel-parse: synthetic grid", () => {
  const parsed = parseTkbSheet(sheetFromGrid(SYNTHETIC_GRID));

  it("parses lesson rows with day/session/period state", () => {
    expect(parsed.entries).toHaveLength(10);
    const first = parsed.entries[0]!;
    expect(first).toMatchObject({
      dayLabel: "Thứ 2",
      dateIso: "2026-09-07",
      sessionCode: "MORNING",
      periodNo: 1,
      classCode: "6A",
      subjectLabel: "Toán",
      teacherAlias: "C.Mai",
      sourceRow: 6, // 1-based Excel row
    });
  });

  it("carries the session across rows and switches on S/C/Sáng labels", () => {
    const afternoon = parsed.entries.find((e) => e.sessionCode === "AFTERNOON")!;
    expect(afternoon).toMatchObject({ dayLabel: "Thứ 2", periodNo: 1, classCode: "6B" });
    const saturday = parsed.entries.find((e) => e.dayLabel === "Thứ 7")!;
    expect(saturday).toMatchObject({ sessionCode: "MORNING", dateIso: "2026-09-12" });
  });

  it("skips free periods (empty Môn+GV cells) and GV-only footnote rows", () => {
    expect(parsed.entries.some((e) => e.sourceRow === 11)).toBe(false); // empty slot row
    expect(parsed.entries.some((e) => e.sourceRow === 13)).toBe(false); // signature row
  });

  it("skips footer rows even when they hit Môn/GV columns", () => {
    expect(parsed.entries.some((e) => e.sourceRow === 12)).toBe(false); // HIỆU TRƯỞNG / Măng Đen
  });

  it("infers the period for a lesson row without a period number", () => {
    const issue = parsed.issues.find((i) => i.type === "PERIOD_INFERRED");
    expect(issue).toBeDefined();
    expect(issue!.details).toMatchObject({ sourceRow: 8, periodNo: 3, sessionCode: "MORNING" });
    const entry = parsed.entries.find((e) => e.sourceRow === 8)!;
    expect(entry.periodInferred).toBe(true);
    expect(entry.periodNo).toBe(3);
  });

  it("flags lessons outside the declared title date range", () => {
    const issue = parsed.issues.find((i) => i.type === "DATE_RANGE_MISMATCH");
    expect(issue).toBeDefined();
    expect(issue!.details).toMatchObject({
      dateIso: "2026-09-12",
      declaredStart: "2026-09-07",
      declaredEnd: "2026-09-11",
      entryCount: 3,
    });
  });

  it("flags the documented header and footer label typos", () => {
    const typos = parsed.issues.filter((i) => i.type === "LABEL_TYPO");
    expect(typos.some((i) => i.message.includes("GV thực hiên"))).toBe(true);
    expect(typos.some((i) => i.message.includes("Măng Đen"))).toBe(true);
  });

  it("maps every entry and resolves alias spacing variants", () => {
    const { mapped, unmapped, issues } = mapEntries(parsed, syntheticContext());
    expect(unmapped).toEqual([]);
    expect(issues).toEqual([]);
    expect(mapped).toHaveLength(10);
    const spaced = mapped.find((e) => e.sourceRow === 7)!; // "C. Mai" cell
    expect(spaced.teacherId).toBe("t-mai");
    const component = mapped.find((e) => e.sourceRow === 6 && e.classId === "cls:7A")!;
    expect(component).toMatchObject({ subjectId: "NS_PHYSICS", subjectComponentId: "PHYSICS" });
  });

  it("reports UNKNOWN_CLASS / UNKNOWN_SUBJECT / UNKNOWN_TEACHER and keeps entries unmapped", () => {
    const entry = (over: Partial<ParsedTkbEntry>): ParseResult => ({
      entries: [
        {
          dayLabel: "Thứ 2",
          dateIso: "2026-09-07",
          sessionCode: "MORNING",
          periodNo: 1,
          periodInferred: false,
          classCode: "6A",
          subjectLabel: "Toán",
          teacherAlias: "C.Mai",
          sourceRow: 6,
          ...over,
        },
      ],
      issues: [],
    });

    const unknownClass = mapEntries(entry({ classCode: "1C" }), syntheticContext());
    expect(unknownClass.mapped).toHaveLength(0);
    expect(unknownClass.unmapped[0]!.reasons).toEqual(["UNKNOWN_CLASS"]);
    expect(unknownClass.issues[0]!.type).toBe("UNKNOWN_CLASS");

    const unknownSubject = mapEntries(entry({ subjectLabel: "Vật lí" }), syntheticContext());
    expect(unknownSubject.unmapped[0]!.reasons).toEqual(["UNKNOWN_SUBJECT"]);

    const unknownTeacher = mapEntries(entry({ teacherAlias: "C.KhôngBiết" }), syntheticContext());
    expect(unknownTeacher.unmapped[0]!.reasons).toEqual(["UNKNOWN_TEACHER"]);
    expect(unknownTeacher.issues[0]!.severity).toBe("ERROR");

    const missingTeacher = mapEntries(entry({ teacherAlias: "" }), syntheticContext());
    expect(missingTeacher.unmapped[0]!.reasons).toEqual(["MISSING_TEACHER"]);
  });

  it("errors with MISSING_DATE_RANGE when the title has no date range", () => {
    const noRange = SYNTHETIC_GRID.filter((row) => !String(row[2] ?? "").includes("Áp dụng"));
    const result = parseTkbSheet(sheetFromGrid(noRange));
    expect(result.issues.some((i) => i.type === "MISSING_DATE_RANGE")).toBe(true);
    expect(result.entries.every((e) => e.dateIso === null)).toBe(true);
  });

  it("produces useful label variants for alias lookups", () => {
    expect(labelVariants("C. Tâm")).toContain("C.Tâm");
    expect(labelVariants("LS&ĐL (Địa)")).toContain("LS&ĐL(Địa)");
    expect(labelVariants("C. Tâm")).toContain(diacriticVariant("C. Tâm"));
  });
});

function diacriticVariant(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u2018\u02BC\u0060\u00B4]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Real workbook regression (week1_schedule.xls)
// ---------------------------------------------------------------------------

describe("excel-parse: real week1_schedule.xls regression", () => {
  // XLSX.readFile cannot be used under vitest's ESM runner (xlsx.mjs has no
  // fs binding there) — read via node:fs and parse the buffer, exactly like
  // the import service does.
  const workbook = XLSX.read(
    readFileSync(path.join(fixtureDir, "source", "week1_schedule.xls")),
    { type: "buffer" },
  );
  const found = findTkbSheet(workbook);

  it("finds the TKB sheet", () => {
    expect(found).not.toBeNull();
    expect(found!.name).toBe("TKB TUẦN 1");
  });

  const parsed = parseTkbSheet(found!.sheet);
  const { mapped, unmapped, issues } = mapEntries(parsed, buildContext());

  it("parses exactly the 236 verified entries", () => {
    expect(parsed.entries).toHaveLength(summaryFixture.entryCount);
    expect(parsed.entries).toHaveLength(entriesFixture.entries.length);
  });

  it("maps all 236 entries across 8 classes with zero unmapped rows", () => {
    expect(mapped).toHaveLength(236);
    expect(unmapped).toEqual([]);
    expect(new Set(mapped.map((e) => e.classId)).size).toBe(8);
  });

  it("has no unknown-teacher/class/subject issues", () => {
    expect(issues.filter((i) => i.type === "UNKNOWN_TEACHER")).toHaveLength(0);
    expect(issues.filter((i) => i.type === "UNKNOWN_CLASS")).toHaveLength(0);
    expect(issues.filter((i) => i.type === "UNKNOWN_SUBJECT")).toHaveLength(0);
    expect(issues.filter((i) => i.type === "MISSING_TEACHER")).toHaveLength(0);
  });

  it("surfaces PERIOD_INFERRED for the Friday 5th period (Excel row 40)", () => {
    const issue = parsed.issues.find((i) => i.type === "PERIOD_INFERRED");
    expect(issue).toBeDefined();
    expect(issue!.details).toMatchObject({
      sourceRow: 40,
      dayLabel: "Thứ 6",
      sessionCode: "MORNING",
      periodNo: 5,
    });
    expect((issue!.details!.classCodes as string[]).sort()).toEqual(["8A", "8B", "9A", "9B"]);
    const inferred = parsed.entries.filter((e) => e.periodInferred);
    expect(inferred).toHaveLength(summaryFixture.entriesWithInferredPeriod);
    expect(inferred.every((e) => e.periodNo === 5 && e.dateIso === "2026-09-11")).toBe(true);
  });

  it("surfaces DATE_RANGE_MISMATCH (title 07–11/09 but Saturday 12/09 has lessons)", () => {
    const issue = parsed.issues.find((i) => i.type === "DATE_RANGE_MISMATCH");
    expect(issue).toBeDefined();
    expect(issue!.details).toMatchObject({
      dayLabel: "Thứ 7",
      dateIso: "2026-09-12",
      declaredStart: "2026-09-07",
      declaredEnd: "2026-09-11",
      entryCount: 24,
    });
  });

  it("surfaces the documented LABEL_TYPO findings (header + footer place)", () => {
    const typos = parsed.issues.filter((i) => i.type === "LABEL_TYPO");
    expect(typos.some((i) => i.message.includes("GV thực hiên"))).toBe(true);
    expect(typos.some((i) => i.message.includes("Măng Đen"))).toBe(true);
  });

  it("reproduces every verified fixture entry (subject, teacher, date, slot)", () => {
    const byRowAndClass = new Map(mapped.map((e) => [`${e.sourceRow}|${e.classId}`, e]));
    for (const fixtureEntry of entriesFixture.entries) {
      const mappedEntry = byRowAndClass.get(`${fixtureEntry.sourceRow}|cls:${fixtureEntry.classCode}`);
      expect(
        mappedEntry,
        `row ${fixtureEntry.sourceRow} class ${fixtureEntry.classCode} (${fixtureEntry.subjectLabel})`,
      ).toBeDefined();
      expect(mappedEntry!.subjectId).toBe(fixtureEntry.subjectCode);
      expect(mappedEntry!.teacherId).toBe(normalizeName(fixtureEntry.teacherName));
      expect(mappedEntry!.dateIso).toBe(fixtureEntry.date);
      expect(mappedEntry!.sessionCode).toBe(fixtureEntry.session);
      expect(mappedEntry!.periodNo).toBe(fixtureEntry.period);
      expect(mappedEntry!.subjectComponentId).toBe(
        subjectsFixture.find((s) => s.code === fixtureEntry.subjectCode)?.component ?? null,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// suggestLabels — "did you mean…" for failed lookups
// ---------------------------------------------------------------------------

describe("suggestLabels", () => {
  const teacherCatalog = [
    "Nguyễn Thị Bích Hiền",
    "Nguyễn Thị Hoài Tâm",
    "Nguyễn Thị Vân",
    "Trần Anh Khoa",
    "Lê Thị Vy",
  ];

  it("suggests the diacritic-free exact match first", () => {
    expect(suggestLabels("nguyen thi bich hien", teacherCatalog)).toEqual([
      "Nguyễn Thị Bích Hiền",
    ]);
  });

  it("suggests partial-name containment (surname + given name fragment)", () => {
    const suggestions = suggestLabels("Nguyễn Vân", teacherCatalog);
    expect(suggestions[0]).toBe("Nguyễn Thị Vân");
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("survives typos via edit-distance similarity", () => {
    const suggestions = suggestLabels("Toám", ["Toán", "Văn", "Tin học"]);
    expect(suggestions[0]).toBe("Toán");
  });

  it("returns nothing when no candidate is recognisable", () => {
    expect(suggestLabels("xyzzy", teacherCatalog)).toEqual([]);
    expect(suggestLabels("", teacherCatalog)).toEqual([]);
    expect(suggestLabels("Toán", undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findDuplicateSlots — same class/day/session/period twice in one file
// ---------------------------------------------------------------------------

describe("findDuplicateSlots", () => {
  const base = {
    classId: "cls:6A",
    dateIso: "2026-09-07",
    sessionCode: "MORNING" as const,
    periodNo: 1,
  };

  it("groups entries that share a class/day/session/period slot", () => {
    const groups = findDuplicateSlots([
      { ...base, sourceRow: 10 },
      { ...base, sourceRow: 14 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sourceRows).toEqual([10, 14]);
  });

  it("ignores different periods, classes, sessions and days", () => {
    expect(
      findDuplicateSlots([
        { ...base, sourceRow: 10 },
        { ...base, periodNo: 2, sourceRow: 11 },
        { ...base, classId: "cls:6B", sourceRow: 12 },
        { ...base, sessionCode: "AFTERNOON", sourceRow: 13 },
        { ...base, dateIso: "2026-09-08", sourceRow: 14 },
      ]),
    ).toEqual([]);
  });

  it("skips entries without a resolved date", () => {
    expect(
      findDuplicateSlots([
        { ...base, dateIso: null, sourceRow: 10 },
        { ...base, dateIso: null, sourceRow: 11 },
      ]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// declaredRange — the sheet title's date range surfaced for week matching
// ---------------------------------------------------------------------------

describe("parseTkbSheet declaredRange", () => {
  it("exposes the declared title range", () => {
    const parsed = parseTkbSheet(sheetFromGrid(SYNTHETIC_GRID));
    expect(parsed.declaredRange).toEqual({ start: "2026-09-07", end: "2026-09-11" });
  });

  it("is null when the title has no readable range", () => {
    const noRange = SYNTHETIC_GRID.filter((row) => !String(row[2] ?? "").includes("Áp dụng"));
    const parsed = parseTkbSheet(sheetFromGrid(noRange));
    expect(parsed.declaredRange).toBeNull();
  });
});

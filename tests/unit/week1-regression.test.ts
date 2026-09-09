/**
 * Regression test against the verified Week 01 fixture
 * (database/fixtures/week1 — extracted from week1_schedule.xls).
 *
 * The 236-entry source week is internally conflict-free; the ONLY expected
 * issue is the documented day-off violation (Trần Anh Khoa, Thứ 5 morning
 * periods 1–2). See database/fixtures/week1/README.md and summary.json.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ConflictContext,
  type ConflictEntryInput,
  validateEntries,
} from "@/server/domain/conflict";
import { computeTeacherWorkloads } from "@/server/domain/workload";
import { normalizeName } from "@/server/domain/normalize";

interface FixtureTeacher {
  fullName: string;
  dayOff: string | null;
}

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

interface FixtureSummary {
  teacherCount: number;
  classCount: number;
  entryCount: number;
  perTeacher: {
    fullName: string;
    pcpnTeachingTotal: number;
    tkbScheduledCount: number;
  }[];
}

const fixtureDir = path.resolve("database/fixtures/week1");
const entriesFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "timetable-entries.json"), "utf8"),
) as { entries: FixtureEntry[] };
const teachersFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "teachers.json"), "utf8"),
) as FixtureTeacher[];
const summaryFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "summary.json"), "utf8"),
) as FixtureSummary;

// Vietnamese Thứ N → ISO weekday (Thứ 2 = Mon = 1 … Thứ 7 = Sat = 6).
function dayOffToIso(label: string): number | null {
  const m = label.match(/Thứ\s*(\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 2 && n <= 8 ? ((n - 1 - 1 + 7) % 7) + 1 : null;
}

function buildContext(): ConflictContext {
  const periods = new Map<string, { sessionId: string; orderNo: number }>();
  for (const code of ["MORNING", "AFTERNOON"]) {
    const max = code === "MORNING" ? 5 : 3;
    for (let i = 1; i <= max; i++) {
      periods.set(`${code}#${i}`, { sessionId: code, orderNo: i });
    }
  }
  const teachers = new Map(
    teachersFixture.map((t) => [
      normalizeName(t.fullName),
      { code: normalizeName(t.fullName), fullName: normalizeName(t.fullName) },
    ]),
  );
  const classes = new Map(
    ["6A", "6B", "7A", "7B", "8A", "8B", "9A", "9B"].map((c) => [
      c,
      { code: c, studentCount: null },
    ]),
  );
  const subjects = new Map(
    [...new Set(entriesFixture.entries.map((e) => e.subjectCode))].map((s) => [s, { code: s }]),
  );
  const days = new Map(
    [...new Set(entriesFixture.entries.map((e) => e.date))].map((iso) => [
      iso,
      { isSchoolDay: true, dayOfWeek: new Date(`${iso}T00:00:00Z`).getUTCDay() },
    ]),
  );
  const teacherAvailability = new Map<string, Map<number, "UNAVAILABLE">>();
  for (const t of teachersFixture) {
    if (!t.dayOff) continue;
    const iso = dayOffToIso(t.dayOff);
    if (iso == null) continue;
    teacherAvailability.set(normalizeName(t.fullName), new Map([[iso, "UNAVAILABLE" as const]]));
  }
  return {
    days,
    periods,
    classes,
    teachers,
    subjects,
    rooms: new Map(),
    teacherAvailability,
  };
}

function toInputs(): ConflictEntryInput[] {
  return entriesFixture.entries.map((e, i) => ({
    id: `f${i}`,
    versionId: "week1",
    versionStatus: "PUBLISHED",
    academicDayId: e.date,
    periodId: `${e.session}#${e.period}`,
    classId: e.classCode,
    teacherId: normalizeName(e.teacherName),
    subjectId: e.subjectCode,
    subjectComponentId: null,
    roomId: null,
    status: "NORMAL",
  }));
}

describe("Week 01 fixture regression", () => {
  it("236 entries, 8 classes, 19 teachers — fixture shape", () => {
    expect(entriesFixture.entries).toHaveLength(summaryFixture.entryCount);
    expect(teachersFixture).toHaveLength(summaryFixture.teacherCount);
  });

  it("the real published week is conflict-free (0 errors)", () => {
    const result = validateEntries(toInputs(), buildContext(), {
      editableStatuses: ["DRAFT", "PUBLISHED"],
    });
    expect(result.errors).toEqual([]);
  });

  it("exactly 2 TEACHER_UNAVAILABLE warnings, both Trần Anh Khoa (Thứ 5)", () => {
    const result = validateEntries(toInputs(), buildContext(), {
      editableStatuses: ["DRAFT", "PUBLISHED"],
    });
    const unavailable = result.warnings.filter((w) => w.code === "TEACHER_UNAVAILABLE");
    expect(unavailable).toHaveLength(2);
    expect(
      unavailable.every((w) => w.details.teacherId === normalizeName("Trần Anh Khoa")),
    ).toBe(true);
  });

  it("no other warnings beyond the documented day-off violation", () => {
    const result = validateEntries(toInputs(), buildContext(), {
      editableStatuses: ["DRAFT", "PUBLISHED"],
    });
    // UNUSUAL_CONSECUTIVE_LOAD legitimately fires on the real data too
    // (block-scheduled mornings: 13 verified teacher/day/session runs of
    // 4–5 periods, e.g. Đông's 5 straight Friday-morning periods); every
    // other warning category must stay silent on this fixture.
    const consecutive = result.warnings.filter(
      (w) => w.code === "UNUSUAL_CONSECUTIVE_LOAD",
    );
    expect(consecutive).toHaveLength(13);
    const codes = result.warnings.filter(
      (w) => w.code !== "TEACHER_UNAVAILABLE" && w.code !== "UNUSUAL_CONSECUTIVE_LOAD",
    );
    expect(codes).toEqual([]);
  });

  it("workload engine reproduces every teacher's TKB scheduled count", () => {
    const entries = entriesFixture.entries.map((e, i) => ({
      id: `f${i}`,
      teacherId: normalizeName(e.teacherName),
      academicDayId: e.date,
      periodId: `${e.session}#${e.period}`,
      status: "NORMAL",
    }));
    const teacherIds = teachersFixture.map((t) => normalizeName(t.fullName));
    const workloads = computeTeacherWorkloads([], entries, [], teacherIds);

    for (const row of summaryFixture.perTeacher) {
      const w = workloads.get(normalizeName(row.fullName));
      expect(w, `missing workload for ${row.fullName}`).toBeDefined();
      expect(w!.scheduled, `${row.fullName} scheduled`).toBe(row.tkbScheduledCount);
    }
  });
});

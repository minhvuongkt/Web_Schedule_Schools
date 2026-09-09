import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  summarizeIssues,
  validateEntries,
  type ConflictContext,
  type ConflictEntryInput,
} from "@/server/domain/conflict";

function makeContext(): ConflictContext {
  const days = new Map<string, { isSchoolDay: boolean; dayOfWeek: number }>();
  for (let dayOfWeek = 1; dayOfWeek <= 6; dayOfWeek++) {
    days.set(`d${dayOfWeek}`, { isSchoolDay: true, dayOfWeek });
  }
  days.set("d7", { isSchoolDay: false, dayOfWeek: 7 });

  const periods = new Map<string, { sessionId: string; orderNo: number }>();
  for (let orderNo = 1; orderNo <= 5; orderNo++) {
    periods.set(`m${orderNo}`, { sessionId: "MORNING", orderNo });
  }
  for (let orderNo = 1; orderNo <= 3; orderNo++) {
    periods.set(`a${orderNo}`, { sessionId: "AFTERNOON", orderNo });
  }

  return {
    days,
    periods,
    classes: new Map([
      ["c6A", { code: "6A", studentCount: 30 }],
      ["c8A", { code: "8A", studentCount: 35 }],
      ["cNull", { code: "7A", studentCount: null }],
    ]),
    teachers: new Map([
      ["t1", { code: "T01", fullName: "Nguyễn Thị Vân" }],
      ["t2", { code: "T02", fullName: "Trần Anh Khoa" }],
    ]),
    subjects: new Map([
      ["sMAT", { code: "MATHEMATICS" }],
      ["sEN", { code: "ENGLISH" }],
    ]),
    rooms: new Map([
      ["r1", { code: "P101", capacity: 30 }],
      ["rBig", { code: "P102", capacity: 40 }],
      ["rNull", { code: "P103", capacity: null }],
    ]),
    teacherAvailability: new Map<string, Map<number, "AVAILABLE" | "UNAVAILABLE" | "PREFERRED">>(),
  };
}

function entry(overrides: Partial<ConflictEntryInput> = {}): ConflictEntryInput {
  return {
    id: "e1",
    versionId: "v1",
    versionStatus: "DRAFT",
    academicDayId: "d1",
    periodId: "m1",
    classId: "c8A",
    teacherId: "t1",
    subjectId: "sMAT",
    subjectComponentId: null,
    roomId: null,
    status: "NORMAL",
    ...overrides,
  };
}

describe("validateEntries", () => {
  it("returns an empty result for empty input", () => {
    const result = validateEntries([], makeContext());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("detects class double-booking with both entry ids in details", () => {
    const result = validateEntries(
      [entry({ id: "e1" }), entry({ id: "e2", teacherId: "t2", subjectId: "sEN" })],
      makeContext(),
    );
    expect(result.errors).toHaveLength(1);
    const issue = result.errors[0];
    expect(issue.code).toBe("CLASS_DOUBLE_BOOKED");
    expect(issue.severity).toBe("ERROR");
    expect(issue.details.entryIds).toEqual(["e1", "e2"]);
    expect(issue.details.entryId).toBe("e1");
    expect(issue.details.conflictingEntryId).toBe("e2");
    expect(issue.details.classId).toBe("c8A");
    expect(issue.message).toContain("8A");
  });

  it("detects teacher double-booking with both entry ids in details", () => {
    const result = validateEntries(
      [entry({ id: "e1" }), entry({ id: "e2", classId: "c6A" })],
      makeContext(),
    );
    expect(result.errors).toHaveLength(1);
    const issue = result.errors[0];
    expect(issue.code).toBe("TEACHER_DOUBLE_BOOKED");
    expect(issue.details.entryIds).toEqual(["e1", "e2"]);
    expect(issue.details.conflictingEntryId).toBe("e2");
    expect(issue.details.teacherId).toBe("t1");
    expect(issue.details.classIds).toEqual(["c8A", "c6A"]);
  });

  it("detects room double-booking with both entry ids in details", () => {
    const result = validateEntries(
      [entry({ id: "e1", roomId: "r1" }), entry({ id: "e2", classId: "c6A", teacherId: "t2", subjectId: "sEN", roomId: "r1" })],
      makeContext(),
    );
    const issue = result.errors.find(candidate => candidate.code === "ROOM_DOUBLE_BOOKED");
    expect(issue).toBeDefined();
    expect(issue?.details.entryIds).toEqual(["e1", "e2"]);
    expect(issue?.details.roomId).toBe("r1");
    expect(result.errors).toHaveLength(1);
  });

  it("ignores null rooms for double-booking", () => {
    const result = validateEntries(
      [entry({ id: "e1", roomId: null }), entry({ id: "e2", classId: "c6A", teacherId: "t2", subjectId: "sEN", roomId: null })],
      makeContext(),
    );
    expect(result.errors).toHaveLength(0);
  });

  it("does not group entries from different versions into the same slot", () => {
    const result = validateEntries(
      [entry({ id: "e1", versionId: "v1" }), entry({ id: "e2", versionId: "v2" })],
      makeContext(),
    );
    expect(result.errors).toHaveLength(0);
  });

  it("frees the slot when the conflicting entry is CANCELLED", () => {
    const result = validateEntries(
      [entry({ id: "e1", status: "CANCELLED" }), entry({ id: "e2" })],
      makeContext(),
    );
    expect(result.errors).toHaveLength(0);
  });

  it("keeps a SUBSTITUTED entry occupying the original teacher's slot", () => {
    const result = validateEntries(
      [entry({ id: "e1", status: "SUBSTITUTED" }), entry({ id: "e2", classId: "c6A" })],
      makeContext(),
    );
    expect(result.errors).toHaveLength(1);
    const issue = result.errors[0];
    expect(issue.code).toBe("TEACHER_DOUBLE_BOOKED");
    expect(issue.details.entryIds).toEqual(["e1", "e2"]);
  });

  it("reports INVALID_REFERENCE for unknown class, teacher, subject and room", () => {
    const result = validateEntries(
      [
        entry({ id: "e-class", classId: "missing-class", periodId: "m1" }),
        entry({ id: "e-teacher", teacherId: "missing-teacher", periodId: "m2" }),
        entry({ id: "e-subject", subjectId: "missing-subject", periodId: "m3" }),
        entry({ id: "e-room", roomId: "missing-room", periodId: "m4" }),
      ],
      makeContext(),
    );
    expect(result.errors).toHaveLength(4);
    expect(result.errors.every(issue => issue.code === "INVALID_REFERENCE")).toBe(true);
    expect(result.errors.map(issue => issue.details.field)).toEqual(["classId", "teacherId", "subjectId", "roomId"]);
    expect(result.warnings).toHaveLength(0);
  });

  it("reports INVALID_PERIOD for an unknown period", () => {
    const result = validateEntries([entry({ id: "e1", periodId: "m99" })], makeContext());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("INVALID_PERIOD");
    expect(result.errors[0].details.periodId).toBe("m99");
  });

  it("reports INVALID_PERIOD for a non-school day", () => {
    const result = validateEntries([entry({ id: "e1", academicDayId: "d7" })], makeContext());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("INVALID_PERIOD");
    expect(result.errors[0].details.isSchoolDay).toBe(false);
    expect(result.errors[0].details.dayOfWeek).toBe(7);
  });

  it("reports INVALID_PERIOD for an unknown academic day", () => {
    const result = validateEntries([entry({ id: "e1", academicDayId: "missing-day" })], makeContext());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("INVALID_PERIOD");
    expect(result.errors[0].details.academicDayId).toBe("missing-day");
  });

  it("flags entries whose version is not editable (PUBLISHED_VERSION_MUTATION)", () => {
    const ctx = makeContext();
    const result = validateEntries([entry({ id: "e1", versionStatus: "PUBLISHED" })], ctx);
    expect(result.errors).toHaveLength(1);
    const issue = result.errors[0];
    expect(issue.code).toBe("PUBLISHED_VERSION_MUTATION");
    expect(issue.details.versionStatus).toBe("PUBLISHED");
    expect(issue.details.versionId).toBe("v1");

    expect(validateEntries([entry({ id: "e1", versionStatus: "DRAFT" })], ctx).errors).toHaveLength(0);

    const allowed = validateEntries(
      [entry({ id: "e1", versionStatus: "REVIEW" })],
      ctx,
      { editableStatuses: ["DRAFT", "REVIEW"] },
    );
    expect(allowed.errors).toHaveLength(0);
  });

  it("treats TEACHER_UNAVAILABLE as a warning by default and an error when promoted", () => {
    const ctx = makeContext();
    ctx.teacherAvailability.set("t1", new Map([[1, "UNAVAILABLE"]]));
    ctx.teacherAvailability.set("t2", new Map([[1, "AVAILABLE"]]));
    const entries = [
      entry({ id: "e1" }),
      entry({ id: "e2", classId: "c6A", teacherId: "t2", subjectId: "sEN" }),
    ];

    const asWarning = validateEntries(entries, ctx);
    expect(asWarning.errors).toHaveLength(0);
    expect(asWarning.warnings).toHaveLength(1);
    expect(asWarning.warnings[0].code).toBe("TEACHER_UNAVAILABLE");
    expect(asWarning.warnings[0].severity).toBe("WARNING");
    expect(asWarning.warnings[0].details.teacherId).toBe("t1");
    expect(asWarning.warnings[0].details.dayOfWeek).toBe(1);

    const asError = validateEntries(entries, ctx, { blockingWarnings: ["TEACHER_UNAVAILABLE"] });
    expect(asError.warnings).toHaveLength(0);
    expect(asError.errors).toHaveLength(1);
    expect(asError.errors[0].code).toBe("TEACHER_UNAVAILABLE");
    expect(asError.errors[0].severity).toBe("ERROR");
  });

  it("does not warn about availability for CANCELLED entries", () => {
    const ctx = makeContext();
    ctx.teacherAvailability.set("t1", new Map([[1, "UNAVAILABLE"]]));
    const result = validateEntries([entry({ status: "CANCELLED" })], ctx);
    expect(result.warnings).toHaveLength(0);
  });

  it("flags UNUSUAL_CONSECUTIVE_LOAD at the threshold boundary (3 no, 4 yes)", () => {
    const ctx = makeContext();
    const atPeriods = (periodIds: string[]): ConflictEntryInput[] =>
      periodIds.map((periodId, index) => entry({ id: `e${index}`, periodId }));

    const three = validateEntries(atPeriods(["m1", "m2", "m3"]), ctx);
    expect(three.warnings.filter(warning => warning.code === "UNUSUAL_CONSECUTIVE_LOAD")).toHaveLength(0);

    const four = validateEntries(atPeriods(["m1", "m2", "m3", "m4"]), ctx);
    const warnings = four.warnings.filter(warning => warning.code === "UNUSUAL_CONSECUTIVE_LOAD");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details.consecutiveCount).toBe(4);
    expect(warnings[0].details.orderNos).toEqual([1, 2, 3, 4]);
    expect(warnings[0].details.teacherId).toBe("t1");
    expect(warnings[0].details.sessionId).toBe("MORNING");
  });

  it("breaks the consecutive run on period gaps and across sessions", () => {
    const ctx = makeContext();
    const atPeriods = (periodIds: string[]): ConflictEntryInput[] =>
      periodIds.map((periodId, index) => entry({ id: `e${index}`, periodId }));

    const gap = validateEntries(atPeriods(["m1", "m2", "m4"]), ctx);
    expect(gap.warnings).toHaveLength(0);

    const crossSession = validateEntries(atPeriods(["m2", "m3", "m4", "a1", "a2", "a3"]), ctx);
    expect(crossSession.warnings).toHaveLength(0);

    const withCustomThreshold = validateEntries(atPeriods(["m1", "m2", "m3"]), ctx, { consecutiveLoadThreshold: 3 });
    const warnings = withCustomThreshold.warnings.filter(warning => warning.code === "UNUSUAL_CONSECUTIVE_LOAD");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details.consecutiveCount).toBe(3);
  });

  it("does not count CANCELLED entries in consecutive load", () => {
    const ctx = makeContext();
    const entries = [
      entry({ id: "e0", periodId: "m1" }),
      entry({ id: "e1", periodId: "m2" }),
      entry({ id: "e2", periodId: "m3", status: "CANCELLED" }),
      entry({ id: "e3", periodId: "m4" }),
    ];
    const result = validateEntries(entries, ctx);
    expect(result.warnings.filter(warning => warning.code === "UNUSUAL_CONSECUTIVE_LOAD")).toHaveLength(0);
  });

  it("warns when a room is smaller than the class student count", () => {
    const ctx = makeContext();
    const result = validateEntries([entry({ id: "e1", roomId: "r1" })], ctx);
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0];
    expect(warning.code).toBe("ROOM_CAPACITY_WARNING");
    expect(warning.severity).toBe("WARNING");
    expect(warning.details.capacity).toBe(30);
    expect(warning.details.studentCount).toBe(35);

    expect(validateEntries([entry({ roomId: "rBig" })], ctx).warnings).toHaveLength(0);
    expect(validateEntries([entry({ roomId: "rNull" })], ctx).warnings).toHaveLength(0);
    expect(validateEntries([entry({ classId: "cNull", roomId: "r1" })], ctx).warnings).toHaveLength(0);
    expect(validateEntries([entry({ roomId: "r1", status: "CANCELLED" })], ctx).warnings).toHaveLength(0);
  });
});

describe("summarizeIssues", () => {
  it("counts issues by code across errors and warnings", () => {
    const ctx = makeContext();
    ctx.teacherAvailability.set("t1", new Map([[1, "UNAVAILABLE"]]));
    const result = validateEntries(
      [entry({ id: "e1" }), entry({ id: "e2", teacherId: "t2", subjectId: "sEN" })],
      ctx,
    );
    const counts = summarizeIssues(result);
    expect(counts["CLASS_DOUBLE_BOOKED"]).toBe(1);
    expect(counts["TEACHER_UNAVAILABLE"]).toBe(1);
    expect(counts["TEACHER_DOUBLE_BOOKED"]).toBeUndefined();
  });

  it("counts promoted warnings under their own code", () => {
    const ctx = makeContext();
    ctx.teacherAvailability.set("t1", new Map([[1, "UNAVAILABLE"]]));
    const result = validateEntries([entry()], ctx, { blockingWarnings: ["TEACHER_UNAVAILABLE"] });
    const counts = summarizeIssues(result);
    expect(counts["TEACHER_UNAVAILABLE"]).toBe(1);
  });
});

describe("Week 01 fixture regression (conflict engine)", () => {
  interface FixtureEntry {
    day: number;
    date: string;
    session: string;
    period: number;
    classCode: string;
    subjectCode: string;
    teacherName: string;
  }

  interface FixtureTeacher {
    fullName: string;
    dayOff: string | null;
  }

  const fixtureDir = fileURLToPath(new URL("../../database/fixtures/week1", import.meta.url));
  const load = <T>(fileName: string): T => JSON.parse(readFileSync(`${fixtureDir}/${fileName}`, "utf-8")) as T;

  const fixture = load<{ week: number; classes: string[]; entries: FixtureEntry[] }>("timetable-entries.json");
  const teachersFixture = load<FixtureTeacher[]>("teachers.json");
  const subjectsFixture = load<Array<{ code: string }>>("subjects.json");

  const dayOffToIsoWeekday = (dayOff: string): number | null => {
    const match = /^Thứ\s+(\d+)/.exec(dayOff);
    return match === null ? null : Number.parseInt(match[1], 10) - 1;
  };

  const dayNumbers = new Map<string, number>();
  for (const fixtureEntry of fixture.entries) dayNumbers.set(fixtureEntry.date, fixtureEntry.day);

  const days = new Map<string, { isSchoolDay: boolean; dayOfWeek: number }>();
  for (const [date, day] of dayNumbers) days.set(date, { isSchoolDay: true, dayOfWeek: day - 1 });

  const periods = new Map<string, { sessionId: string; orderNo: number }>();
  for (let orderNo = 1; orderNo <= 5; orderNo++) periods.set(`MORNING#${orderNo}`, { sessionId: "MORNING", orderNo });
  for (let orderNo = 1; orderNo <= 3; orderNo++) periods.set(`AFTERNOON#${orderNo}`, { sessionId: "AFTERNOON", orderNo });

  const classes = new Map<string, { code: string; studentCount: number | null }>();
  for (const code of fixture.classes) classes.set(code, { code, studentCount: null });

  const teachers = new Map<string, { code: string; fullName: string }>();
  for (let index = 0; index < teachersFixture.length; index++) {
    const fullName = teachersFixture[index].fullName;
    teachers.set(fullName, { code: `T${String(index + 1).padStart(2, "0")}`, fullName });
  }

  const subjects = new Map<string, { code: string }>();
  for (const subject of subjectsFixture) subjects.set(subject.code, { code: subject.code });

  const teacherAvailability = new Map<string, Map<number, "AVAILABLE" | "UNAVAILABLE" | "PREFERRED">>();
  for (const teacher of teachersFixture) {
    const iso = teacher.dayOff === null ? null : dayOffToIsoWeekday(teacher.dayOff);
    if (iso !== null) teacherAvailability.set(teacher.fullName, new Map([[iso, "UNAVAILABLE"]]));
  }

  const ctx: ConflictContext = {
    days,
    periods,
    classes,
    teachers,
    subjects,
    rooms: new Map<string, { code: string; capacity: number | null }>(),
    teacherAvailability,
  };

  const entries: ConflictEntryInput[] = fixture.entries.map((fixtureEntry, index) => ({
    id: `fx-${index}`,
    versionId: "week1-published",
    versionStatus: "PUBLISHED",
    academicDayId: fixtureEntry.date,
    periodId: `${fixtureEntry.session}#${fixtureEntry.period}`,
    classId: fixtureEntry.classCode,
    teacherId: fixtureEntry.teacherName,
    subjectId: fixtureEntry.subjectCode,
    subjectComponentId: null,
    roomId: null,
    status: "NORMAL",
  }));

  it("validates all 236 fixture entries", () => {
    expect(entries).toHaveLength(236);
  });

  it("returns zero errors for the conflict-free published week", () => {
    // Re-validating PUBLISHED content (not proposing a mutation): include
    // PUBLISHED in editableStatuses so the mutation guard stays silent here.
    const result = validateEntries(entries, ctx, { editableStatuses: ["DRAFT", "PUBLISHED"] });
    expect(result.errors).toHaveLength(0);
  });

  it("returns exactly two TEACHER_UNAVAILABLE warnings, both Trần Anh Khoa on Thứ 5 morning periods 1–2", () => {
    const result = validateEntries(entries, ctx, { editableStatuses: ["DRAFT", "PUBLISHED"] });
    const unavailable = result.warnings.filter(warning => warning.code === "TEACHER_UNAVAILABLE");
    expect(unavailable).toHaveLength(2);
    expect(unavailable.map(warning => warning.details.teacherId)).toEqual(["Trần Anh Khoa", "Trần Anh Khoa"]);
    expect(unavailable.map(warning => warning.details.academicDayId)).toEqual(["2026-09-10", "2026-09-10"]);
    expect(unavailable.map(warning => warning.details.periodId)).toEqual(["MORNING#1", "MORNING#2"]);
    expect(unavailable.every(warning => warning.details.dayOfWeek === 4)).toBe(true);
    expect(unavailable.every(warning => warning.severity === "WARNING")).toBe(true);
  });

  it("promotes the fixture TEACHER_UNAVAILABLE findings to errors when blocking", () => {
    const result = validateEntries(entries, ctx, {
      editableStatuses: ["DRAFT", "PUBLISHED"],
      blockingWarnings: ["TEACHER_UNAVAILABLE"],
    });
    expect(result.warnings.filter(warning => warning.code === "TEACHER_UNAVAILABLE")).toHaveLength(0);
    expect(result.errors.filter(error => error.code === "TEACHER_UNAVAILABLE")).toHaveLength(2);
  });

  it("keeps the fixture-verified count of UNUSUAL_CONSECUTIVE_LOAD warnings", () => {
    // 13 teacher/day/session groups reach 4+ consecutive periods in the real
    // week (block-scheduled mornings) — locks run/gap/session semantics.
    const result = validateEntries(entries, ctx, { editableStatuses: ["DRAFT", "PUBLISHED"] });
    expect(result.warnings.filter(warning => warning.code === "UNUSUAL_CONSECUTIVE_LOAD")).toHaveLength(13);
  });
});

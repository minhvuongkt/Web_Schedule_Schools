import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  computeTeacherWorkloads,
  type WorkloadAssignmentInput,
  type WorkloadEntryInput,
} from "@/server/domain/workload";

function assignment(overrides: Partial<WorkloadAssignmentInput> = {}): WorkloadAssignmentInput {
  return {
    teacherId: "t1",
    classId: "c6A",
    subjectId: "sMAT",
    subjectComponentId: null,
    lessonsPerWeek: 1,
    assignmentType: "TEACHING",
    ...overrides,
  };
}

function scheduledEntry(overrides: Partial<WorkloadEntryInput> = {}): WorkloadEntryInput {
  return {
    id: "e1",
    teacherId: "t1",
    academicDayId: "d1",
    periodId: "m1",
    status: "NORMAL",
    ...overrides,
  };
}

describe("computeTeacherWorkloads", () => {
  it("computes expected teaching, duty, scheduled and difference", () => {
    const assignments = [
      assignment({ lessonsPerWeek: 4, classId: "c6A" }),
      assignment({ lessonsPerWeek: 3, classId: "c7A" }),
      assignment({ lessonsPerWeek: 4, classId: null, subjectId: null, assignmentType: "DUTY" }),
    ];
    const entries = Array.from({ length: 6 }, (_, index) =>
      scheduledEntry({ id: `e${index}`, periodId: `m${(index % 5) + 1}` }),
    );
    const workloads = computeTeacherWorkloads(assignments, entries, []);
    expect(workloads.get("t1")).toEqual({
      teacherId: "t1",
      expectedTeaching: 7,
      dutyLessons: 4,
      scheduled: 6,
      difference: -1,
    });
  });

  it("moves a lesson from the original teacher to the substitute only for CONFIRMED substitutions", () => {
    const entries = [scheduledEntry({ id: "e1", status: "SUBSTITUTED" })];
    const substitutions = [
      { entryId: "e1", originalTeacherId: "t1", substituteTeacherId: "t2", status: "CONFIRMED" },
    ];
    const workloads = computeTeacherWorkloads([], entries, substitutions, ["t1"]);
    expect(workloads.get("t1")?.scheduled).toBe(0);
    expect(workloads.get("t2")?.scheduled).toBe(1);
  });

  it("counts PENDING and CANCELLED substitutions for nobody", () => {
    const entries = [
      scheduledEntry({ id: "e1", periodId: "m1", status: "SUBSTITUTED" }),
      scheduledEntry({ id: "e2", periodId: "m2", status: "SUBSTITUTED" }),
    ];
    const substitutions = [
      { entryId: "e1", originalTeacherId: "t1", substituteTeacherId: "t2", status: "PENDING" },
      { entryId: "e2", originalTeacherId: "t1", substituteTeacherId: "t2", status: "CANCELLED" },
    ];
    const workloads = computeTeacherWorkloads([], entries, substitutions, ["t1", "t2"]);
    expect(workloads.get("t1")?.scheduled).toBe(0);
    expect(workloads.get("t2")?.scheduled).toBe(0);
    expect(computeTeacherWorkloads([], entries, substitutions).has("t2")).toBe(false);
  });

  it("does not count CANCELLED entries for anybody", () => {
    const entries = [
      scheduledEntry({ id: "e1", periodId: "m1", status: "CANCELLED" }),
      scheduledEntry({ id: "e2", periodId: "m2" }),
      scheduledEntry({ id: "e3", periodId: "m3" }),
    ];
    const workloads = computeTeacherWorkloads([], entries, []);
    expect(workloads.get("t1")?.scheduled).toBe(2);
  });

  it("counts MOVED and MAKEUP entries for the owning teacher", () => {
    const entries = [
      scheduledEntry({ id: "e1", periodId: "m1", status: "MOVED" }),
      scheduledEntry({ id: "e2", periodId: "m2", status: "MAKEUP" }),
    ];
    const workloads = computeTeacherWorkloads([], entries, []);
    expect(workloads.get("t1")?.scheduled).toBe(2);
  });

  it("counts a SUBSTITUTED entry with no substitution record for nobody", () => {
    const workloads = computeTeacherWorkloads([], [scheduledEntry({ status: "SUBSTITUTED" })], [], ["t1"]);
    expect(workloads.get("t1")?.scheduled).toBe(0);
  });

  it("includes teachers with no rows when teacherIds is provided", () => {
    const workloads = computeTeacherWorkloads([], [], [], ["t9"]);
    expect(workloads.get("t9")).toEqual({
      teacherId: "t9",
      expectedTeaching: 0,
      dutyLessons: 0,
      scheduled: 0,
      difference: 0,
    });
  });

  it("ignores assignment types other than TEACHING and DUTY", () => {
    const workloads = computeTeacherWorkloads(
      [assignment({ lessonsPerWeek: 5, assignmentType: "SOMETHING_ELSE" })],
      [],
      [],
    );
    expect(workloads.get("t1")).toEqual({
      teacherId: "t1",
      expectedTeaching: 0,
      dutyLessons: 0,
      scheduled: 0,
      difference: 0,
    });
  });

  it("recomputes difference from scheduled minus expected (never manual surpluses)", () => {
    const assignments = [assignment({ lessonsPerWeek: 4 })];
    const entries = Array.from({ length: 6 }, (_, index) =>
      scheduledEntry({ id: `e${index}`, periodId: `m${(index % 5) + 1}` }),
    );
    const workloads = computeTeacherWorkloads(assignments, entries, []);
    expect(workloads.get("t1")?.difference).toBe(2);
  });
});

describe("Week 01 fixture regression (workload engine)", () => {
  interface FixtureEntry {
    date: string;
    session: string;
    period: number;
    teacherName: string;
  }

  interface PerTeacherSummary {
    fullName: string;
    tkbScheduledCount: number;
  }

  const fixtureDir = fileURLToPath(new URL("../../database/fixtures/week1", import.meta.url));
  const load = <T>(fileName: string): T => JSON.parse(readFileSync(`${fixtureDir}/${fileName}`, "utf-8")) as T;

  const fixture = load<{ entries: FixtureEntry[] }>("timetable-entries.json");
  const summary = load<{ perTeacher: PerTeacherSummary[] }>("summary.json");

  const entries: WorkloadEntryInput[] = fixture.entries.map((fixtureEntry, index) => ({
    id: `fx-${index}`,
    teacherId: fixtureEntry.teacherName,
    academicDayId: fixtureEntry.date,
    periodId: `${fixtureEntry.session}#${fixtureEntry.period}`,
    status: "NORMAL",
  }));

  const workloads = computeTeacherWorkloads(
    [],
    entries,
    [],
    summary.perTeacher.map(perTeacher => perTeacher.fullName),
  );

  it("reproduces the per-teacher scheduled counts reconciled in summary.json", () => {
    expect(summary.perTeacher).toHaveLength(19);
    for (const perTeacher of summary.perTeacher) {
      expect(workloads.get(perTeacher.fullName)?.scheduled).toBe(perTeacher.tkbScheduledCount);
    }
    expect(workloads.size).toBe(19);
  });

  it("matches the spot-checked teachers named in the brief", () => {
    expect(workloads.get("Trần Anh Khoa")?.scheduled).toBe(14);
    expect(workloads.get("Nguyễn Thị Hoài Tâm")?.scheduled).toBe(16);
    expect(workloads.get("Y Nam")?.scheduled).toBe(13);
    expect(workloads.get("Nguyễn Viết Trung")?.scheduled).toBe(4);
    expect(workloads.get("Lê Xuân Ngọc")?.scheduled).toBe(16);
  });

  it("reports difference equal to scheduled when no assignment data is supplied", () => {
    for (const workload of workloads.values()) {
      expect(workload.expectedTeaching).toBe(0);
      expect(workload.difference).toBe(workload.scheduled);
    }
  });
});

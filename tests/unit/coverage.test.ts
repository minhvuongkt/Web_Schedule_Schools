import { describe, expect, it } from "vitest";
import {
  computeAssignmentCoverage,
  computeTeacherWorkloads,
  computeWorkloadIssues,
  type CoverageAssignmentInput,
  type CoverageEntryInput,
} from "@/server/domain/workload";

function assignment(
  id: string,
  overrides: Partial<CoverageAssignmentInput> = {},
): CoverageAssignmentInput {
  return {
    id,
    teacherId: "t1",
    classId: "c8A",
    subjectId: "sMAT",
    subjectComponentId: null,
    lessonsPerWeek: 4,
    assignmentType: "TEACHING",
    ...overrides,
  };
}

function coverageEntry(
  id: string,
  overrides: Partial<CoverageEntryInput> = {},
): CoverageEntryInput {
  return {
    id,
    teacherId: "t1",
    academicDayId: "d1",
    periodId: "m1",
    status: "NORMAL",
    classId: "c8A",
    subjectId: "sMAT",
    subjectComponentId: null,
    ...overrides,
  };
}

describe("computeAssignmentCoverage", () => {
  it("counts scheduled lessons per (teacher, class, subject, component)", () => {
    const rows = computeAssignmentCoverage(
      [assignment("a1")],
      [
        coverageEntry("e1"),
        coverageEntry("e2", { periodId: "m2" }),
        coverageEntry("e3", { periodId: "m3" }),
      ],
    );
    expect(rows.get("a1")).toMatchObject({ lessonsPerWeek: 4, scheduled: 3, missing: 1 });
  });

  it("does not match a different class or subject", () => {
    const rows = computeAssignmentCoverage(
      [assignment("a1")],
      [coverageEntry("e1", { classId: "c9B" }), coverageEntry("e2", { subjectId: "sVAN" })],
    );
    expect(rows.get("a1")?.scheduled).toBe(0);
  });

  it("matches component-qualified assignments only by component", () => {
    const rows = computeAssignmentCoverage(
      [assignment("a1", { subjectId: "sNS", subjectComponentId: "PHYSICS" })],
      [
        coverageEntry("e1", { subjectId: "sNS", subjectComponentId: "PHYSICS" }),
        coverageEntry("e2", { subjectId: "sNS", subjectComponentId: "CHEMISTRY" }),
      ],
    );
    expect(rows.get("a1")?.scheduled).toBe(1);
  });

  it("skips CANCELLED entries and DUTY assignments; SUBSTITUTED still fulfills", () => {
    const rows = computeAssignmentCoverage(
      [
        assignment("a1"),
        assignment("a2", { classId: null, subjectId: null, assignmentType: "DUTY", lessonsPerWeek: 4 }),
      ],
      [
        coverageEntry("e1", { status: "SUBSTITUTED" }),
        coverageEntry("e2", { periodId: "m2", status: "CANCELLED" }),
      ],
    );
    expect(rows.get("a1")?.scheduled).toBe(1);
    expect(rows.has("a2")).toBe(false);
  });
});

describe("computeWorkloadIssues", () => {
  it("flags over and below expected workloads", () => {
    const workloads = new Map([
      ["t1", { teacherId: "t1", expectedTeaching: 10, dutyLessons: 0, scheduled: 12, difference: 2 }],
      ["t2", { teacherId: "t2", expectedTeaching: 10, dutyLessons: 0, scheduled: 8, difference: -2 }],
      ["t3", { teacherId: "t3", expectedTeaching: 10, dutyLessons: 0, scheduled: 10, difference: 0 }],
    ] as const);
    const issues = computeWorkloadIssues(workloads, new Map());
    expect(issues.map((i) => i.code)).toEqual(["WORKLOAD_OVER_EXPECTED", "WORKLOAD_BELOW_EXPECTED"]);
    expect(issues[0].details.teacherId).toBe("t1");
    expect(issues[1].details.teacherId).toBe("t2");
  });

  it("flags assignments not fully scheduled", () => {
    const workloads = new Map([
      ["t1", { teacherId: "t1", expectedTeaching: 4, dutyLessons: 0, scheduled: 4, difference: 0 }],
    ]);
    const coverage = new Map([
      ["a1", {
        assignmentId: "a1",
        teacherId: "t1",
        classId: "c8A",
        subjectId: "sMAT",
        subjectComponentId: null,
        lessonsPerWeek: 4,
        scheduled: 3,
        missing: 1,
      }],
    ]);
    const issues = computeWorkloadIssues(workloads, coverage);
    expect(issues.map((i) => i.code)).toEqual(["ASSIGNMENT_NOT_FULLY_SCHEDULED"]);
    expect(issues[0].details.missing).toBe(1);
  });
});

describe("computeTeacherWorkloads accepts optional assignment id", () => {
  it("still works without ids (backward compatible)", () => {
    const result = computeTeacherWorkloads(
      [{ teacherId: "t1", classId: "c1", subjectId: "s1", subjectComponentId: null, lessonsPerWeek: 3, assignmentType: "TEACHING" }],
      [{ id: "e1", teacherId: "t1", academicDayId: "d1", periodId: "m1", status: "NORMAL" }],
      [],
    );
    expect(result.get("t1")?.scheduled).toBe(1);
  });
});

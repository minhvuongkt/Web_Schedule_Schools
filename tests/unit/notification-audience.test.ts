import { describe, expect, it } from "vitest";

import {
  AUDIENCE_LABELS_VI,
  audienceTargets,
  isAudience,
} from "@/server/domain/notification-audience";

describe("audienceTargets", () => {
  it("teachers audience targets teaching staff only, no class announcements", () => {
    const targets = audienceTargets("TEACHERS");
    expect(targets.roles).toEqual(["TEACHER", "PRINCIPAL"]);
    expect(targets.classAnnouncement).toBe(false);
  });

  it("students audience targets student/parent accounts AND class announcements", () => {
    const targets = audienceTargets("STUDENTS");
    expect(targets.roles).toEqual(["STUDENT", "PARENT"]);
    expect(targets.classAnnouncement).toBe(true);
  });

  it("all audience is the union of teachers and students", () => {
    const all = audienceTargets("ALL");
    const teachers = audienceTargets("TEACHERS");
    const students = audienceTargets("STUDENTS");
    expect([...all.roles].sort()).toEqual(
      [...teachers.roles, ...students.roles].sort(),
    );
    expect(all.classAnnouncement).toBe(true);
  });

  it("never targets admin roles (they have no notification inbox)", () => {
    for (const audience of ["TEACHERS", "STUDENTS", "ALL"] as const) {
      expect(audienceTargets(audience).roles).not.toContain("SUPER_ADMIN");
      expect(audienceTargets(audience).roles).not.toContain("TIMETABLE_ADMIN");
    }
  });

  it("has a Vietnamese label for every audience", () => {
    expect(Object.keys(AUDIENCE_LABELS_VI).sort()).toEqual([
      "ALL",
      "STUDENTS",
      "TEACHERS",
    ]);
  });
});

describe("isAudience", () => {
  it("accepts known audiences and rejects unknown strings", () => {
    expect(isAudience("TEACHERS")).toBe(true);
    expect(isAudience("STUDENTS")).toBe(true);
    expect(isAudience("ALL")).toBe(true);
    expect(isAudience("EVERYONE")).toBe(false);
    expect(isAudience("")).toBe(false);
  });
});

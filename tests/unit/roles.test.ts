import { describe, expect, it } from "vitest";
import {
  assertPermission,
  AuthorizationError,
  can,
  isRole,
  type Role,
} from "@/server/domain/roles";

describe("RBAC matrix", () => {
  it("students and parents never see internal workload", () => {
    for (const role of ["STUDENT", "PARENT"] as Role[]) {
      expect(can(role, "workload:read-all")).toBe(false);
      expect(can(role, "workload:read-own")).toBe(false);
    }
  });

  it("teachers read their own schedule and workload but cannot mutate timetables", () => {
    expect(can("TEACHER", "timetable:read-own")).toBe(true);
    expect(can("TEACHER", "workload:read-own")).toBe(true);
    expect(can("TEACHER", "timetable:write")).toBe(false);
    expect(can("TEACHER", "timetable:publish")).toBe(false);
    expect(can("TEACHER", "timetable:approve")).toBe(false);
    expect(can("TEACHER", "assignments:manage")).toBe(false);
  });

  it("only PRINCIPAL and SUPER_ADMIN approve; admins write", () => {
    expect(can("PRINCIPAL", "timetable:approve")).toBe(true);
    expect(can("SUPER_ADMIN", "timetable:approve")).toBe(true);
    expect(can("TIMETABLE_ADMIN", "timetable:approve")).toBe(false);
    expect(can("TIMETABLE_ADMIN", "timetable:write")).toBe(true);
    expect(can("TIMETABLE_ADMIN", "timetable:publish")).toBe(true);
    expect(can("PRINCIPAL", "timetable:write")).toBe(false);
  });

  it("only SUPER_ADMIN manages users and only SUPER_ADMIN/PRINCIPAL read audit", () => {
    expect(can("SUPER_ADMIN", "users:manage")).toBe(true);
    for (const role of ["TIMETABLE_ADMIN", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"] as Role[]) {
      expect(can(role, "users:manage")).toBe(false);
    }
    expect(can("PRINCIPAL", "audit:read")).toBe(true);
    expect(can("TEACHER", "audit:read")).toBe(false);
  });

  it("everyone can read published timetables", () => {
    for (const role of [
      "SUPER_ADMIN",
      "TIMETABLE_ADMIN",
      "PRINCIPAL",
      "TEACHER",
      "STUDENT",
      "PARENT",
    ] as Role[]) {
      expect(can(role, "timetable:read-published")).toBe(true);
    }
  });

  it("assertPermission throws with code and role context", () => {
    expect(() => assertPermission("STUDENT", "workload:read-all")).toThrowError(
      AuthorizationError,
    );
    try {
      assertPermission("STUDENT", "workload:read-all");
    } catch (error) {
      const authz = error as AuthorizationError;
      expect(authz.code).toBe("FORBIDDEN");
      expect(authz.role).toBe("STUDENT");
      expect(authz.permission).toBe("workload:read-all");
    }
    expect(() => assertPermission("SUPER_ADMIN", "users:manage")).not.toThrow();
  });

  it("isRole guards unknown role strings", () => {
    expect(isRole("TEACHER")).toBe(true);
    expect(isRole("SUPERUSER")).toBe(false);
    expect(isRole("")).toBe(false);
  });
});

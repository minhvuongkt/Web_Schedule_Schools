/**
 * RBAC matrix (pure). Roles per master build prompt §4. Server-side checks
 * are mandatory for every route handler and protected page; this module is
 * the single source of truth for who can do what.
 */

export const ROLES = [
  "SUPER_ADMIN",
  "TIMETABLE_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "STUDENT",
  "PARENT",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "timetable:read-published", // public + all roles
  "timetable:read-own", // own class/teacher schedule
  "timetable:read-all", // incl. DRAFT/REVIEW/APPROVED versions
  "timetable:write", // create/edit entries on editable versions
  "timetable:submit-review",
  "timetable:approve",
  "timetable:publish",
  "assignments:manage",
  "workload:read-all", // teacher workload dashboard (internal)
  "workload:read-own",
  "import:excel",
  "export:excel",
  "export:pdf",
  "notifications:send", // broadcast announcements from the admin area
  "users:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  TIMETABLE_ADMIN: [
    "timetable:read-published",
    "timetable:read-own",
    "timetable:read-all",
    "timetable:write",
    "timetable:submit-review",
    "timetable:publish",
    "assignments:manage",
    "workload:read-all",
    "import:excel",
    "export:excel",
    "export:pdf",
    "notifications:send",
  ],
  PRINCIPAL: [
    "timetable:read-published",
    "timetable:read-own",
    "timetable:read-all",
    "timetable:approve",
    "timetable:publish",
    "workload:read-all",
    "export:excel",
    "export:pdf",
    "audit:read",
  ],
  TEACHER: ["timetable:read-published", "timetable:read-own", "workload:read-own", "export:pdf"],
  STUDENT: ["timetable:read-published", "timetable:read-own"],
  PARENT: ["timetable:read-published", "timetable:read-own"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(
    readonly permission: Permission,
    readonly role: Role,
  ) {
    super(`Vai trò ${role} không được phép thực hiện ${permission}.`);
    this.name = "AuthorizationError";
  }
}

/** Throws AuthorizationError when the role lacks the permission. */
export function assertPermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new AuthorizationError(permission, role);
  }
}

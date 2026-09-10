import type { Role } from "@/server/domain/roles";

/**
 * Where each role's workspace lives. Shared by the landing navbar and the
 * public page header so logged-in users always see one consistent
 * destination instead of a login button.
 */
export const WORKSPACE_BY_ROLE: Partial<Record<Role, { href: string; label: string }>> = {
  TEACHER: { href: "/gv", label: "Lịch dạy của tôi" },
  PRINCIPAL: { href: "/bg", label: "Bảng điều khiển" },
  SUPER_ADMIN: { href: "/admin", label: "Soạn thời khóa biểu" },
  TIMETABLE_ADMIN: { href: "/admin", label: "Soạn thời khóa biểu" },
  STUDENT: { href: "/hsv", label: "Sổ tay học sinh" },
  PARENT: { href: "/hsv", label: "Sổ tay học sinh" },
};

/** Staff roles have an internal workspace beyond the public pages. */
export function isStaffRole(role: string): boolean {
  return (
    role === "TEACHER" ||
    role === "PRINCIPAL" ||
    role === "SUPER_ADMIN" ||
    role === "TIMETABLE_ADMIN"
  );
}

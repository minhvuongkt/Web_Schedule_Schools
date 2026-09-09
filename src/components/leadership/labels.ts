export const SCHOOL_NAME_VI = "PTDTBT TH & THCS Măng Cành";

const ROLE_LABELS_VI: Record<string, string> = {
  SUPER_ADMIN: "Quản trị hệ thống",
  TIMETABLE_ADMIN: "Quản trị thời khóa biểu",
  PRINCIPAL: "Hiệu trưởng",
  TEACHER: "Giáo viên",
  STUDENT: "Học sinh",
  PARENT: "Phụ huynh",
};

export function roleLabelVi(role: string): string {
  return ROLE_LABELS_VI[role] ?? role;
}

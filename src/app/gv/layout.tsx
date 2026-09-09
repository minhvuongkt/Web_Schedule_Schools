import type { Metadata } from "next";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/dang-nhap/actions";
import { requireTeacher } from "@/server/auth/session";
import { getActiveSchoolName } from "@/server/services/teacher-view.service";
import { Icon } from "@/components/ui/icon";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Lịch dạy — Măng Cành" };
}

const ROLE_LABELS_VI: Record<string, string> = {
  SUPER_ADMIN: "Quản trị hệ thống",
  TIMETABLE_ADMIN: "Quản trị thời khóa biểu",
  PRINCIPAL: "Hiệu trưởng",
  TEACHER: "Giáo viên",
  STUDENT: "Học sinh",
  PARENT: "Phụ huynh",
};

function roleLabelVi(role: string): string {
  return ROLE_LABELS_VI[role] ?? role;
}

export default async function TeacherAreaLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireTeacher();
  const schoolName = await getActiveSchoolName();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="no-print sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            {schoolName ? (
              <p className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
                {schoolName}
              </p>
            ) : null}
            <p className="truncate text-sm font-semibold text-zinc-900">
              {user.displayName}
              <span className="font-normal text-zinc-500">
                {" "}
                · {roleLabelVi(user.role)}
              </span>
            </p>
          </div>
          <form action={logoutAction} className="shrink-0">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="logout" size={16} />
                Đăng xuất
              </span>
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}

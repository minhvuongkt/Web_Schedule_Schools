import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";
import { logoutAction } from "@/app/dang-nhap/actions";
import { PlannerApp } from "@/components/planner/planner-app";

export const metadata: Metadata = {
  title: "Xếp thời khóa biểu",
};

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Quản trị hệ thống",
  TIMETABLE_ADMIN: "Cán bộ TKB",
  PRINCIPAL: "Hiệu trưởng",
  TEACHER: "Giáo viên",
  STUDENT: "Học sinh",
  PARENT: "Phụ huynh",
};

export default async function AdminPage() {
  const user = await requireUser("/admin");
  if (!can(user.role, "timetable:read-all")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  return (
    <main className="flex-1 bg-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              Xếp thời khóa biểu
            </h1>
            <p className="text-xs text-zinc-500">
              {user.displayName} · {ROLE_LABELS[user.role] ?? user.role}
            </p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/admin/danh-muc" className="text-blue-700 hover:underline">
              Danh mục
            </Link>
            <Link href="/admin/thay-giao" className="text-blue-700 hover:underline">
              Dạy thay &amp; dạy bù
            </Link>
            <Link href="/admin/import" className="text-blue-700 hover:underline">
              Nhập Excel
            </Link>
            <Link href="/admin/audit" className="text-blue-700 hover:underline">
              Nhật ký
            </Link>
            <Link href="/tkb" className="text-blue-700 hover:underline">
              Xem TKB
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-zinc-500"
              >
                Đăng xuất
              </button>
            </form>
          </nav>
        </div>
      </header>
      <PlannerApp user={{ role: user.role, displayName: user.displayName }} />
    </main>
  );
}

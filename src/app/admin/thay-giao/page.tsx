import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";
import { LiveOpsApp } from "@/components/live-ops/live-ops-app";

export const metadata: Metadata = {
  title: "Dạy thay & dạy bù",
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

export default async function SubstitutionsPage() {
  const user = await requireUser("/admin/thay-giao");
  if (!can(user.role, "timetable:write")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  return (
    <main className="flex-1 bg-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              Dạy thay &amp; dạy bù
            </h1>
            <p className="text-xs text-zinc-500">
              {user.displayName} · {ROLE_LABELS[user.role] ?? user.role} · áp dụng
              trên phiên bản đã công bố
            </p>
          </div>
          <nav className="text-sm">
            <a href="/admin" className="text-blue-700 hover:underline">
              ← Xếp thời khóa biểu
            </a>
          </nav>
        </div>
      </header>
      <LiveOpsApp />
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";
import { AppShell } from "@/components/site/app-shell";
import { AssignmentsApp } from "@/components/leadership/assignments-app";

export const metadata: Metadata = {
  title: "Phân công giảng dạy",
};

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const user = await requireUser("/bg/phan-cong");
  if (!can(user.role, "assignments:manage") && !can(user.role, "workload:read-all")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }
  const canManage = can(user.role, "assignments:manage");

  return (
    <AppShell page="Phân công giảng dạy" user={user}>
      <main className="flex-1">
        <div className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4">
            <h1 className="text-lg font-semibold text-zinc-900">
              Phân công giảng dạy
            </h1>
            <p className="text-xs text-zinc-500">
              Khối lượng giảng dạy dự kiến (ai dạy môn gì, lớp nào, bao nhiêu
              tiết/tuần) — tách biệt với thời khóa biểu đã xếp.
              {!canManage && " (chỉ xem)"}
            </p>
          </div>
        </div>
        <AssignmentsApp canManage={canManage} />
      </main>
    </AppShell>
  );
}

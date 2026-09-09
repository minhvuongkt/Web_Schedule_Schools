import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";
import { AppShell } from "@/components/site/app-shell";
import { dateToIso } from "@/server/services/school-calendar";
import ImportForm from "./ImportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nhập thời khóa biểu từ Excel",
};

/**
 * /admin/import — minimal Vietnamese import UI (file + week + preview /
 * commit). Weeks are loaded server-side from the DB (the /api/weeks route
 * requires a session cookie, which a server component cannot forward
 * without an internal fetch helper, so the page reads Prisma directly).
 */
export default async function ImportPage() {
  const user = await requireUser("/admin/import");
  if (!can(user.role, "import:excel")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  const weeks = await prisma.week.findMany({
    where: { semester: { schoolYear: { status: "ACTIVE" } } },
    select: { id: true, weekNo: true, startDate: true, endDate: true, status: true },
    orderBy: { weekNo: "asc" },
  });
  const weekOptions = weeks.map((week) => ({
    id: week.id,
    weekNo: week.weekNo,
    weekStart: dateToIso(week.startDate),
    weekEnd: dateToIso(week.endDate),
  }));

  return (
    <AppShell page="Nhập từ Excel" user={user}>
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Nhập thời khóa biểu từ Excel
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Tệp .xls/.xlsx có trang tính TKB (không dùng multipart — tệp được đọc
            thành base64 phía trình duyệt). Xem trước không ghi dữ liệu; nhập
            khẩu là tất-cả-hoặc-không-gì.
          </p>
        </header>
        <ImportForm weeks={weekOptions} />
      </div>
    </AppShell>
  );
}

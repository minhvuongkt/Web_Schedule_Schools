import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { errorResponse } from "@/server/api/errors";
import { getCurrentUser } from "@/server/auth/session";
import { assertPermission, AuthorizationError, type Role } from "@/server/domain/roles";
import { dateToIso, findActiveSchoolYear, resolveActiveWeek, todayIso } from "@/server/services/school-calendar";
import { prisma } from "@/server/db";

/**
 * GET /api/timetable/import/template?weekId=<optional>
 *
 * Generates an .xlsx skeleton that the importer can parse back: title row
 * carrying the target week's declared date range (RANGE_RE in
 * excel-parse.ts), "Lớp <code>" column pairs with Môn/GV sub-headers, and
 * Thứ N / buổi / tiết scaffolding for every school day of the week. The
 * admin fills in the Môn/GV cells and imports — no layout errors possible.
 *
 * Auth: "import:excel" (same as the import route).
 */

function viDateParts(iso: string): { day: number; month: number; year: number } {
  return {
    day: Number(iso.slice(8, 10)),
    month: Number(iso.slice(5, 7)),
    year: Number(iso.slice(0, 4)),
  };
}

const SESSION_VI: Record<string, { label: string; periods: number }> = {
  MORNING: { label: "S", periods: 5 },
  AFTERNOON: { label: "C", periods: 3 },
};

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHENTICATED", "Bạn cần đăng nhập.");
  }
  try {
    assertPermission(user.role as Role, "import:excel");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(403, "FORBIDDEN", error.message, { permission: error.permission });
    }
    throw error;
  }

  const weekId = new URL(request.url).searchParams.get("weekId") ?? undefined;

  // Resolve the target week: given weekId, else the active week.
  let week: { id: string; weekNo: number; weekStart: string; weekEnd: string } | null = null;
  try {
    if (weekId) {
      const row = await prisma.week.findUnique({
        where: { id: weekId },
        select: { id: true, weekNo: true, startDate: true, endDate: true },
      });
      if (row) {
        week = {
          id: row.id,
          weekNo: row.weekNo,
          weekStart: dateToIso(row.startDate),
          weekEnd: dateToIso(row.endDate),
        };
      }
    } else {
      const year = await findActiveSchoolYear();
      if (year) {
        const active = await resolveActiveWeek(year.id, todayIso());
        if (active) {
          const row = await prisma.week.findUnique({
            where: { id: active.id },
            select: { id: true, weekNo: true, startDate: true, endDate: true },
          });
          if (row) {
            week = {
              id: row.id,
              weekNo: row.weekNo,
              weekStart: dateToIso(row.startDate),
              weekEnd: dateToIso(row.endDate),
            };
          }
        }
      }
    }
  } catch {
    // Fall through with week=null → generic placeholder range below.
  }

  // Classes of the active school year (same scope as the importer's mapper).
  const year = await findActiveSchoolYear();
  const classes = year
    ? await prisma.class.findMany({
        where: { schoolYearId: year.id },
        select: { code: true },
        orderBy: [{ grade: "asc" }, { code: "asc" }],
      })
    : [];
  const classCodes = classes.map((klass) => klass.code);
  if (classCodes.length === 0) {
    return errorResponse(
      400,
      "NO_CLASSES",
      "Chưa có lớp học nào trong năm học đang hoạt động — không tạo được file mẫu.",
    );
  }

  // Declared range text: the week's real range when known, else a placeholder
  // (importing a placeholder template fails with MISSING_DATE_RANGE, which
  // tells the admin to fill the real range — still better than no template).
  const start = week ? viDateParts(week.weekStart) : { day: 1, month: 9, year: 2026 };
  const end = week ? viDateParts(week.weekEnd) : { day: 6, month: 9, year: 2026 };
  const title =
    `THỜI KHÓA BIỂU (Áp dụng từ ngày ${start.day} tháng ${start.month} năm ${start.year} ` +
    `đến ngày ${end.day} tháng ${end.month} năm ${end.year})`;

  // Grid columns: A=day label, B=buổi, C=tiết, then 2 columns per class.
  const headerRow: (string | null)[] = [null, null, null];
  const subHeaderRow: (string | null)[] = [null, null, "Tiết"];
  for (const code of classCodes) {
    headerRow.push(`Lớp ${code}`, null);
    subHeaderRow.push("Môn", "GV thực hiện");
  }

  const rows: (string | number | null)[][] = [
    ["TRƯỜNG PTDTBT TH & THCS MĂNG CÀNH", null, null],
    [title, null, null],
    headerRow,
    subHeaderRow,
  ];

  // School days Mon→Sat (Sunday is never a school day; Saturday is — see
  // AGENTS.md). Each session block restarts the period counter; empty
  // Môn/GV cells are skipped by the parser, so scaffolding is harmless.
  for (const dayNo of [2, 3, 4, 5, 6, 7]) {
    for (const session of Object.values(SESSION_VI)) {
      for (let period = 1; period <= session.periods; period++) {
        const row: (string | number | null)[] = [
          period === 1 ? `Thứ ${dayNo}` : null,
          period === 1 ? session.label : null,
          period,
        ];
        for (let i = 0; i < classCodes.length; i++) row.push(null, null);
        rows.push(row);
      }
    }
  }
  rows.push([null, null, null, "HIỆU TRƯỞNG"]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 10 }, // Thứ
    { wch: 6 }, // Buổi
    { wch: 6 }, // Tiết
    ...classCodes.map(() => ({ wch: 16 })), // Môn
    ...classCodes.map(() => ({ wch: 20 })), // GV
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "TKB MẪU");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fileName = week
    ? `mau-tkb-tuan-${String(week.weekNo).padStart(2, "0")}.xlsx`
    : "mau-tkb.xlsx";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

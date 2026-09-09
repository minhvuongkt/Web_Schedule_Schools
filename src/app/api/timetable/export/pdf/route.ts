import { NextResponse } from "next/server";
import { errorResponse } from "@/server/api/errors";
import { getCurrentUser } from "@/server/auth/session";
import { assertPermission, AuthorizationError, type Role } from "@/server/domain/roles";
import {
  EXPORT_SCOPES,
  exportTimetablePrintHtml,
  ExportError,
  type ExportScope,
} from "@/server/services/export.service";

/**
 * GET /api/timetable/export/pdf?scope=…&weekId=&classId=&teacherId=
 *
 * Phase-1 PDF strategy (documented in the service header): no headless
 * renderer dependency is allowed on this machine, so this endpoint returns
 * print-optimized HTML rendering the same PUBLISHED-version data as the
 * Excel export. The "In / Lưu PDF" button (marked .no-print) calls
 * window.print(); @media print CSS forces black-on-white and hides links.
 *
 * Auth: "export:excel" (TIMETABLE_ADMIN / PRINCIPAL / SUPER_ADMIN). The
 * TEACHER "export:pdf" permission is not consumed here — public /tkb pages
 * already offer browser printing for personal schedules.
 */

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHENTICATED", "Bạn cần đăng nhập.");
  }
  try {
    assertPermission(user.role as Role, "export:excel");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(403, "FORBIDDEN", error.message, { permission: error.permission });
    }
    throw error;
  }

  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") ?? "school") as ExportScope;
  if (!EXPORT_SCOPES.includes(scope)) {
    return errorResponse(400, "VALIDATION_ERROR", `scope không hợp lệ: ${scope}`, {
      supported: EXPORT_SCOPES,
    });
  }
  const weekId = url.searchParams.get("weekId") ?? undefined;
  const classId = url.searchParams.get("classId") ?? undefined;
  const teacherId = url.searchParams.get("teacherId") ?? undefined;

  try {
    const { html } = await exportTimetablePrintHtml({
      scope,
      weekId,
      classId,
      teacherId,
      actor: user,
    });
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return errorResponse(error.status, error.code, error.message, error.details);
    }
    console.error("PDF export API error:", error);
    return errorResponse(500, "INTERNAL", "Lỗi máy chủ khi xuất bản in.");
  }
}

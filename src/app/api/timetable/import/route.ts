import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { getCurrentUser } from "@/server/auth/session";
import { assertPermission, AuthorizationError, type Role } from "@/server/domain/roles";
import { commitImport, ImportError, previewImport } from "@/server/services/import.service";

/**
 * POST /api/timetable/import — Excel TKB import (two-phase).
 *
 * Body: { fileBase64, fileName, weekId?, mode: "preview" | "commit" }.
 * The file is sent as base64 JSON (no multipart); .xls/.xlsx only.
 * Auth: "import:excel" (TIMETABLE_ADMIN / SUPER_ADMIN per the RBAC matrix).
 */

// ~10 MB binary → ~13.4M base64 chars.
const MAX_BASE64_LENGTH = 14_000_000;

const bodySchema = z.object({
  fileBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
  fileName: z.string().trim().min(1).max(255),
  weekId: z.string().min(1).optional(),
  mode: z.enum(["preview", "commit"]),
});

export async function POST(request: Request): Promise<NextResponse> {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return zodErrorResponse(parsed.error.issues);
  }
  const { fileBase64, fileName, weekId, mode } = parsed.data;

  if (!/\.(xls|xlsx)$/i.test(fileName)) {
    return errorResponse(
      400,
      "UNSUPPORTED_FILE_TYPE",
      "Chỉ nhận tệp Excel .xls hoặc .xlsx.",
      { fileName },
    );
  }

  const fileBuffer = Buffer.from(fileBase64, "base64");
  if (fileBuffer.length === 0) {
    return errorResponse(400, "VALIDATION_ERROR", "Tệp rỗng hoặc không giải mã được.");
  }

  if (mode === "commit" && !weekId) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Thiếu weekId khi nhập khẩu (bắt buộc cho chế độ commit).",
      { field: "weekId" },
    );
  }

  try {
    if (mode === "preview") {
      const result = await previewImport({ fileBuffer, fileName, weekId });
      return NextResponse.json(result);
    }
    const result = await commitImport({ fileBuffer, fileName, weekId: weekId!, actor: user });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImportError) {
      return errorResponse(error.status, error.code, error.message, error.details);
    }
    console.error("Import API error:", error);
    return errorResponse(500, "INTERNAL", "Lỗi máy chủ khi nhập khẩu thời khóa biểu.");
  }
}

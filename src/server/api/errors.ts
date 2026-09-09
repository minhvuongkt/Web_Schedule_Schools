import { NextResponse } from "next/server";

/**
 * Consistent API error envelope required by the master build prompt §25:
 * { "error": { "code", "message", "details" } }
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export function zodErrorResponse(
  issues: { path: (string | number | symbol)[]; message: string }[],
): NextResponse<ApiErrorBody> {
  return errorResponse(400, "VALIDATION_ERROR", "Dữ liệu gửi lên không hợp lệ.", {
    issues: issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}

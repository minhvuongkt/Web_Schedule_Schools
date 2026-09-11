import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { mutationErrorResponse, requireApiUser } from "@/server/api/timetable-api";
import { updateEmail } from "@/server/services/profile.service";

/** PATCH /api/me — change the account email (code-verified new address). */
export async function PATCH(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = z
    .object({
      email: z.string().max(200),
      emailConfirm: z.string().max(200),
      code: z.string().max(20),
    })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    const result = await updateEmail(auth.user, parsed.data);
    return NextResponse.json({ ok: true, email: result.email });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

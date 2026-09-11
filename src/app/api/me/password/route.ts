import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { mutationErrorResponse, requireApiUser } from "@/server/api/timetable-api";
import { SESSION_COOKIE, sessionTokenHash } from "@/server/services/auth.service";
import { changePassword } from "@/server/services/profile.service";

/** POST /api/me/password — self-service password change. */
export async function POST(request: Request): Promise<NextResponse> {
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
      currentPassword: z.string().min(1).max(200),
      password: z.string().max(200),
      passwordConfirm: z.string().max(200),
    })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);

  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    await changePassword(
      auth.user,
      parsed.data,
      token ? sessionTokenHash(token) : null,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

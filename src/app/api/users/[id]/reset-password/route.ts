import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse, type Params } from "@/server/api/timetable-api";
import { resetUserPassword } from "@/server/services/user.service";

/** POST /api/users/:id/reset-password  {password?} → {newPassword} */
export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // An empty body is fine — a random password is generated.
    body = {};
  }
  const parsed = z
    .object({ password: z.string().min(8).max(128).optional() })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(
      await resetUserPassword(id, parsed.data.password, auth.user),
    );
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

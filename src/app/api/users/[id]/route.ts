import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse, type Params } from "@/server/api/timetable-api";
import { updateUser } from "@/server/services/user.service";

/** PATCH /api/users/:id  {displayName?, email?, role?, teacherId?, isActive?} */
export async function PATCH(
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
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = z
    .object({
      displayName: z.string().min(2).max(120).optional(),
      email: z.string().email().max(160).nullish(),
      role: z
        .enum(["SUPER_ADMIN", "TIMETABLE_ADMIN", "PRINCIPAL", "TEACHER", "STUDENT", "PARENT"])
        .optional(),
      teacherId: z.string().min(1).nullish(),
      isActive: z.boolean().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(
      await updateUser(
        id,
        {
          displayName: parsed.data.displayName,
          // Preserve explicit null (clear) vs absent (keep) — do not coerce.
          email: parsed.data.email,
          role: parsed.data.role,
          teacherId: parsed.data.teacherId,
          isActive: parsed.data.isActive,
        },
        auth.user,
      ),
    );
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse, type Params } from "@/server/api/timetable-api";
import { deleteUser, updateUser } from "@/server/services/user.service";

/** PATCH /api/users/:id  {displayName?, role?, teacherId?, isActive?} — no email (teacher-owned). */
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
      // email is teacher-owned (first-login wizard / account page); an email
      // field sent by a stale client is ignored, not stored.
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

/** DELETE /api/users/:id — permanently remove an account (users:manage). */
export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    await deleteUser(id, auth.user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

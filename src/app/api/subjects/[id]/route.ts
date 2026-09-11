import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse, type Params } from "@/server/api/timetable-api";
import { updateSubject, deleteSubject } from "@/server/services/catalog.service";

/** PATCH /api/subjects/:id  {name?, category?} */

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
      name: z.string().min(1).max(120).optional(),
      category: z.string().max(120).nullish(),
    })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(await updateSubject(id, parsed.data, auth.user));
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

/** DELETE /api/subjects/:id — only when unused and component-free (409 otherwise). */
export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    await deleteSubject(id, auth.user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

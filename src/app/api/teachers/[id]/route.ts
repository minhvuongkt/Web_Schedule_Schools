import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse, type Params } from "@/server/api/timetable-api";
import { updateTeacher } from "@/server/services/catalog.service";

/** PATCH /api/teachers/:id  {fullName?, shortName?, specialty?, position?, isActive?} */

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
      fullName: z.string().min(2).max(120).optional(),
      shortName: z.string().max(60).nullish(),
      specialty: z.string().max(120).nullish(),
      position: z.string().max(60).nullish(),
      isActive: z.boolean().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(await updateTeacher(id, parsed.data, auth.user));
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import {
  createSubjectComponent,
  updateSubjectComponent,
} from "@/server/services/catalog.service";

/**
 * POST  /api/subjects/components           {subjectId, code, name}
 * PATCH /api/subjects/components?id=...    {name}
 */

const createSchema = z.object({
  subjectId: z.string().min(1),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
});

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(await createSubjectComponent(parsed.data, auth.user), {
      status: 201,
    });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

const patchSchema = z.object({ name: z.string().min(1).max(120) });

export async function PATCH(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return errorResponse(400, "VALIDATION_ERROR", "Thiếu tham số id.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(await updateSubjectComponent(id, parsed.data, auth.user));
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

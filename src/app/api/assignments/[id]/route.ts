import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import { updateAssignment, deactivateAssignment } from "@/server/services/assignments.service";

const patchSchema = z.object({
  teacherId: z.string().min(1).optional(),
  classId: z.string().nullish(),
  subjectId: z.string().nullish(),
  subjectComponentId: z.string().nullish(),
  lessonsPerWeek: z.number().int().min(0).max(50).optional(),
  assignmentType: z.enum(["TEACHING", "DUTY"]).optional(),
  notes: z.string().max(500).nullish(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(await updateAssignment(id, parsed.data, auth.user));
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const reason = new URL(request.url).searchParams.get("reason");
  try {
    return NextResponse.json(await deactivateAssignment(id, reason, auth.user));
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

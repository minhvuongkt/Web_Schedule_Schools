import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import {
  listAssignments,
  createAssignment,
} from "@/server/services/assignments.service";

/**
 * GET  /api/assignments?teacherId=&includeInactive=
 * POST /api/assignments  {teacherId, classId?, subjectId?, subjectComponentId?,
 *                          lessonsPerWeek, assignmentType?, notes?}
 */

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const teacherId = url.searchParams.get("teacherId") ?? undefined;
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  try {
    return NextResponse.json({ assignments: await listAssignments(auth.user, { teacherId, includeInactive }) });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

const createSchema = z.object({
  teacherId: z.string().min(1),
  classId: z.string().nullish(),
  subjectId: z.string().nullish(),
  subjectComponentId: z.string().nullish(),
  lessonsPerWeek: z.number().int().min(0).max(50),
  assignmentType: z.enum(["TEACHING", "DUTY"]).optional(),
  notes: z.string().max(500).nullish(),
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
    return NextResponse.json(await createAssignment(parsed.data, auth.user));
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

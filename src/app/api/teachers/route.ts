import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import { prisma } from "@/server/db";
import { createTeacher, listTeacherCatalog } from "@/server/services/catalog.service";

/**
 * GET  /api/teachers            (catalog view — assignments:manage)
 * GET  /api/teachers?teacherId= (legacy selector view — any logged-in user)
 * POST /api/teachers            {code, fullName, shortName?, specialty?, position?}
 */

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);

  if (url.searchParams.get("catalog") === "true") {
    try {
      return NextResponse.json({ teachers: await listTeacherCatalog(auth.user) });
    } catch (error) {
      return mutationErrorResponse(error) ?? internal(error);
    }
  }

  const teachers = await prisma.teacher.findMany({
    select: { id: true, code: true, fullName: true, position: true, isActive: true },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({
    teachers: teachers
      .filter((t) => t.isActive)
      .map((t) => ({
        id: t.id,
        code: t.code,
        fullName: t.fullName,
        shortName: t.fullName.split(" ").slice(-2).join(" "),
        position: t.position,
      })),
  });
}

const createSchema = z.object({
  code: z.string().min(1).max(20),
  fullName: z.string().min(2).max(120),
  shortName: z.string().max(60).nullish(),
  specialty: z.string().max(120).nullish(),
  position: z.string().max(60).nullish(),
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
    return NextResponse.json(await createTeacher(parsed.data, auth.user), { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

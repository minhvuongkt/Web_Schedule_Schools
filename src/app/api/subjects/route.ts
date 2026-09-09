import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import { prisma } from "@/server/db";
import { createSubject, listSubjectCatalog } from "@/server/services/catalog.service";

/**
 * GET  /api/subjects                (legacy selector view — any logged-in user)
 * GET  /api/subjects?catalog=true   (catalog view — assignments:manage)
 * POST /api/subjects                {code, name, category?}
 */

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (new URL(request.url).searchParams.get("catalog") === "true") {
    try {
      return NextResponse.json({ subjects: await listSubjectCatalog(auth.user) });
    } catch (error) {
      return mutationErrorResponse(error) ?? internal(error);
    }
  }
  const subjects = await prisma.subject.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      components: { select: { id: true, code: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ subjects });
}

const createSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  category: z.string().max(120).nullish(),
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
    return NextResponse.json(await createSubject(parsed.data, auth.user), { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

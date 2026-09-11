import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import { createUser, listLinkableTeachers, listUsers } from "@/server/services/user.service";

/** GET /api/users — list accounts + linkable teachers (users:manage). */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    const [users, teachers] = await Promise.all([
      listUsers(auth.user),
      listLinkableTeachers(auth.user),
    ]);
    return NextResponse.json({ users, teachers });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

/** POST /api/users — create an account (users:manage). */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = z
    .object({
      username: z.string().min(3).max(32),
      displayName: z.string().min(2).max(120),
      password: z.string().min(8).max(128),
      role: z.enum([
        "SUPER_ADMIN",
        "TIMETABLE_ADMIN",
        "PRINCIPAL",
        "TEACHER",
        "STUDENT",
        "PARENT",
      ]),
      // email is teacher-owned (first-login wizard / account page); an email
      // field sent by a stale client is ignored, not stored.
      teacherId: z.string().min(1).nullish(),
    })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(
      await createUser(
        {
          username: parsed.data.username,
          displayName: parsed.data.displayName,
          password: parsed.data.password,
          role: parsed.data.role,
          teacherId: parsed.data.teacherId ?? null,
        },
        auth.user,
      ),
      { status: 201 },
    );
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  listAnnouncements,
  sendAnnouncement,
} from "@/server/services/announcement.service";

/** GET /api/announcements — recent sends (notifications:send). */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  try {
    const announcements = await listAnnouncements(
      auth.user,
      Number.isFinite(limit) ? limit : 20,
    );
    return NextResponse.json({ announcements });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

/** POST /api/announcements — broadcast to teachers, students or everyone. */
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
      audience: z.enum(["TEACHERS", "STUDENTS", "ALL", "SELECTED"]),
      title: z.string().min(2).max(ANNOUNCEMENT_TITLE_MAX),
      body: z.string().min(1).max(ANNOUNCEMENT_BODY_MAX),
      userIds: z.array(z.string().min(1)).max(500).optional(),
    })
    .refine(
      (data) =>
        data.audience !== "SELECTED" ||
        (Array.isArray(data.userIds) && data.userIds.length > 0),
      { message: "Hãy chọn ít nhất một người nhận.", path: ["userIds"] },
    )
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    const announcement = await sendAnnouncement(
      {
        audience: parsed.data.audience,
        title: parsed.data.title,
        body: parsed.data.body,
        userIds: parsed.data.userIds,
      },
      auth.user,
    );
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

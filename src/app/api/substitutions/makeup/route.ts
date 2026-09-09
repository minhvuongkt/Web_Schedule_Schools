import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import { createMakeupLesson } from "@/server/services/live-ops.service";

const schema = z.object({
  originalEntryId: z.string().min(1),
  academicDayId: z.string().min(1),
  periodId: z.string().min(1),
  roomId: z.string().nullish(),
  reason: z.string().max(500).nullish(),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(
      await createMakeupLesson(
        {
          originalEntryId: parsed.data.originalEntryId,
          academicDayId: parsed.data.academicDayId,
          periodId: parsed.data.periodId,
          roomId: parsed.data.roomId ?? null,
          reason: parsed.data.reason ?? null,
        },
        auth.user,
      ),
    );
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

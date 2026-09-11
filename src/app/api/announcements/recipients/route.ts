import { NextResponse } from "next/server";

import { errorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import { listSelectableRecipients } from "@/server/services/announcement.service";

/** GET /api/announcements/recipients — accounts for SELECTED sends. */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    const recipients = await listSelectableRecipients(auth.user);
    return NextResponse.json({ recipients });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

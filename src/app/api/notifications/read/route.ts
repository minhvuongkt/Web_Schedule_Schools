import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/api/timetable-api";
import { markNotificationsRead } from "@/server/services/notification.service";

/**
 * POST /api/notifications/read — mark the caller's notifications read.
 * Body: { ids: string[] } (notification ids) or { all: true }.
 * This route is what the UI posts to (NotificationCard / MarkAllReadButton);
 * the handler previously lived under /api/notifications and never matched.
 */
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
    .union([
      z.object({ all: z.literal(true) }),
      z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }),
    ])
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);

  const updated = await markNotificationsRead(
    auth.user,
    "all" in parsed.data ? { all: true } : { ids: parsed.data.ids },
  );
  return NextResponse.json({ ok: true, updated });
}

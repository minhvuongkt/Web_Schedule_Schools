import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/api/timetable-api";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/server/services/push.service";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(43).max(200),
    auth: z.string().min(16).max(100),
  }),
});

/** POST /api/push/subscribe — register the current user's push subscription. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    await savePushSubscription(auth.user.id, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("API error:", error);
    return errorResponse(400, "INVALID_SUBSCRIPTION", "Đăng ký thông báo đẩy không hợp lệ.");
  }
}

/** DELETE /api/push/subscribe — unregister an endpoint. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = z
    .object({ endpoint: z.string().url().max(2048) })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  await removePushSubscription(auth.user.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}

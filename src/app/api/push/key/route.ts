import { NextResponse } from "next/server";

import { errorResponse } from "@/server/api/errors";
import { getVapidConfig } from "@/server/services/push.service";

/** GET /api/push/key — VAPID application server key for subscribe(). */
export async function GET(): Promise<NextResponse> {
  const vapid = getVapidConfig();
  if (!vapid) {
    return errorResponse(
      404,
      "PUSH_DISABLED",
      "Thông báo đẩy chưa được cấu hình trên máy chủ.",
    );
  }
  return NextResponse.json({ publicKey: vapid.publicKey });
}

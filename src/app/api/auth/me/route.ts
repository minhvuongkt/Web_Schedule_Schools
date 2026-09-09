import { NextResponse } from "next/server";
import { errorResponse } from "@/server/api/errors";
import { getCurrentUser } from "@/server/auth/session";
import type { SessionUser } from "@/server/services/auth.service";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHENTICATED", "Bạn cần đăng nhập.");
  }
  return NextResponse.json<{ user: SessionUser }>({ user });
}

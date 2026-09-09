import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { rateLimit } from "@/server/api/rate-limit";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import {
  SESSION_COOKIE,
  login,
  sessionCookieOptions,
  type SessionUser,
} from "@/server/services/auth.service";

const bodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

function clientKey(request: Request): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `login-api:${ip}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  const limit = rateLimit(clientKey(request), 10, 15 * 60_000);
  if (!limit.allowed) {
    return errorResponse(429, "RATE_LIMITED", "Quá nhiều lần thử. Vui lòng thử lại sau.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return zodErrorResponse(parsed.error.issues);
  }

  try {
    const { token, user } = await login(parsed.data.username, parsed.data.password);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
    return NextResponse.json<{ user: SessionUser }>({ user });
  } catch {
    return errorResponse(401, "INVALID_CREDENTIALS", "Sai tên đăng nhập hoặc mật khẩu.");
  }
}

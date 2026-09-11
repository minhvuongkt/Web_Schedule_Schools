import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { rateLimit } from "@/server/api/rate-limit";
import { prisma } from "@/server/db";
import {
  normalizeEmail,
  validateEmailAddress,
} from "@/server/domain/credentials";
import {
  isMailConfigured,
  sendVerificationCodeEmail,
} from "@/server/services/mail.service";
import { MutationError } from "@/server/services/timetable-write.service";
import { issueVerificationCode } from "@/server/services/verification.service";

/**
 * POST /api/auth/forgot-password — request a password-reset code by email.
 *
 * Always answers { ok: true } whether or not the address exists so the
 * endpoint cannot be used to enumerate accounts. Mail problems are logged
 * server-side, never reflected per-address in the response.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`forgot:${ip}`, 10, 15 * 60_000);
  if (!limit.allowed) {
    return errorResponse(429, "RATE_LIMITED", "Quá nhiều yêu cầu. Vui lòng thử lại sau.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = z.object({ email: z.string().max(200) }).safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);

  const format = validateEmailAddress(parsed.data.email);
  if (!format.ok) {
    return errorResponse(400, "VALIDATION_ERROR", format.error ?? "Email không hợp lệ.");
  }
  if (!isMailConfigured()) {
    return errorResponse(
      503,
      "MAIL_NOT_CONFIGURED",
      "Chức năng gửi email chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true },
  });

  if (user) {
    try {
      const { code } = await issueVerificationCode({
        email,
        purpose: "PASSWORD_RESET",
        userId: user.id,
      });
      await sendVerificationCodeEmail(email, code, "PASSWORD_RESET");
    } catch (error) {
      if (error instanceof MutationError && error.code === "RESEND_TOO_SOON") {
        // A code was sent moments ago; stay silent to keep the response generic.
        return NextResponse.json({ ok: true });
      }
      console.error("forgot-password: gửi mã thất bại", error);
    }
  }

  return NextResponse.json({ ok: true });
}

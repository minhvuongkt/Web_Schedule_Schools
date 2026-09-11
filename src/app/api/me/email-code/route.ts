import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { rateLimit } from "@/server/api/rate-limit";
import { mutationErrorResponse, requireApiUser } from "@/server/api/timetable-api";
import { prisma } from "@/server/db";
import {
  normalizeEmail,
  validateEmailAddress,
} from "@/server/domain/credentials";
import {
  isMailConfigured,
  sendVerificationCodeEmail,
} from "@/server/services/mail.service";
import { issueVerificationCode } from "@/server/services/verification.service";

/**
 * POST /api/me/email-code — send a verification code to the address the user
 * is about to save (onboarding or account email change). Authenticated: the
 * address does not belong to anyone else yet, so uniqueness is checked here
 * to fail before any email is sent.
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
    .object({
      email: z.string().max(200),
      purpose: z.enum(["ONBOARDING", "EMAIL_CHANGE"]),
    })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);

  const format = validateEmailAddress(parsed.data.email);
  if (!format.ok) return errorResponse(400, "VALIDATION_ERROR", format.error ?? "Email không hợp lệ.");

  if (!isMailConfigured()) {
    return errorResponse(
      503,
      "MAIL_NOT_CONFIGURED",
      "Chức năng gửi email chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const taken = await prisma.user.findFirst({
    where: { email, id: { not: auth.user.id } },
    select: { id: true },
  });
  if (taken) {
    return errorResponse(409, "EMAIL_TAKEN", "Email này đã được dùng cho tài khoản khác.");
  }

  const limit = rateLimit(`email-code:${auth.user.id}`, 6, 15 * 60_000);
  if (!limit.allowed) {
    return errorResponse(429, "RATE_LIMITED", "Bạn đã yêu cầu mã quá nhiều lần. Vui lòng thử lại sau.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  try {
    const { code } = await issueVerificationCode({
      email,
      purpose: parsed.data.purpose,
      userId: auth.user.id,
    });
    await sendVerificationCodeEmail(email, code, parsed.data.purpose);
    return NextResponse.json({ ok: true, ttlSeconds: 600, retryAfterSeconds: 60 });
  } catch (error) {
    const response = mutationErrorResponse(error);
    if (response) return response;
    console.error("API error:", error);
    return errorResponse(
      502,
      "MAIL_FAILED",
      "Không gửi được email xác nhận. Vui lòng kiểm tra địa chỉ email và thử lại.",
    );
  }
}

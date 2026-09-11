import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { rateLimit } from "@/server/api/rate-limit";
import { mutationErrorResponse } from "@/server/api/timetable-api";
import { prisma } from "@/server/db";
import {
  normalizeEmail,
  validateEmailAddress,
  validateNewPassword,
} from "@/server/domain/credentials";
import { hashPassword } from "@/server/domain/password";
import { consumeVerificationCode } from "@/server/services/verification.service";

/**
 * POST /api/auth/reset-password — finish the forgot-password flow: consume
 * the emailed code, store the new password, verify the email and revoke
 * every session of that account.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`reset:${ip}`, 15, 15 * 60_000);
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
  const parsed = z
    .object({
      email: z.string().max(200),
      code: z.string().max(20),
      password: z.string().max(200),
      passwordConfirm: z.string().max(200),
    })
    .safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);

  const format = validateEmailAddress(parsed.data.email);
  if (!format.ok) {
    return errorResponse(400, "VALIDATION_ERROR", format.error ?? "Email không hợp lệ.");
  }
  const passwordCheck = validateNewPassword(parsed.data.password, parsed.data.passwordConfirm);
  if (!passwordCheck.ok) {
    return errorResponse(400, "VALIDATION_ERROR", passwordCheck.error ?? "Mật khẩu không hợp lệ.");
  }

  const email = normalizeEmail(parsed.data.email);
  const invalidCode = () =>
    errorResponse(400, "INVALID_CODE", "Mã xác nhận không đúng hoặc đã hết hạn.");

  try {
    await consumeVerificationCode({
      email,
      purpose: "PASSWORD_RESET",
      code: parsed.data.code,
    });
  } catch (error) {
    const response = mutationErrorResponse(error);
    if (response) return response;
    console.error("API error:", error);
    return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
  }

  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true, displayName: true, onboardingCompletedAt: true },
  });
  if (!user) return invalidCode();

  await prisma.$transaction(async (t) => {
    await t.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(parsed.data.password),
        emailVerifiedAt: new Date(),
        // Proof of mailbox ownership also replaces the first-login wizard.
        onboardingCompletedAt: user.onboardingCompletedAt ?? new Date(),
      },
    });
    await t.authSession.deleteMany({ where: { userId: user.id } });
    await t.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.displayName,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        reason: "password reset via email code",
      },
    });
  });

  return NextResponse.json({ ok: true });
}

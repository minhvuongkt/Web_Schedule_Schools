import { prisma } from "@/server/db";
import {
  normalizeEmail,
  validateEmailAddress,
  validateEmailConfirmation,
  validateNewPassword,
} from "@/server/domain/credentials";
import { hashPassword, verifyPassword } from "@/server/domain/password";
import { consumeVerificationCode } from "@/server/services/verification.service";
import { MutationError } from "@/server/services/timetable-write.service";
import type { SessionUser } from "@/server/services/auth.service";

/**
 * Self-service account management for every authenticated user:
 *
 * - completeOnboarding — first-login wizard: set email + own password, mark
 *   the account set up. Enforced by requireUser for ALL roles.
 * - changePassword — verify the current password, store the new one and
 *   revoke every other session.
 * - updateEmail — change the account email (case-insensitive uniqueness).
 *
 * Both email-writing paths require a one-time code sent to the new address
 * (see verification.service + mail.service), so the address is genuinely
 * reachable before it is stored.
 */

export interface OnboardingInput {
  email: string;
  emailConfirm: string;
  code: string;
  password: string;
  passwordConfirm: string;
}

function validationError(message: string | undefined): MutationError {
  return new MutationError("VALIDATION_ERROR", message ?? "Dữ liệu không hợp lệ.", {}, 400);
}

function emailTakenError(): MutationError {
  return new MutationError(
    "EMAIL_TAKEN",
    "Email này đã được dùng cho tài khoản khác.",
    {},
    409,
  );
}

export async function completeOnboarding(
  user: SessionUser,
  input: OnboardingInput,
): Promise<void> {
  const emailCheck = validateEmailAddress(input.email);
  if (!emailCheck.ok) throw validationError(emailCheck.error);
  const confirmCheck = validateEmailConfirmation(input.email, input.emailConfirm);
  if (!confirmCheck.ok) throw validationError(confirmCheck.error);
  const passwordCheck = validateNewPassword(input.password, input.passwordConfirm);
  if (!passwordCheck.ok) throw validationError(passwordCheck.error);

  const email = normalizeEmail(input.email);
  await consumeVerificationCode({ email, purpose: "ONBOARDING", code: input.code });
  await prisma.$transaction(async (t) => {
    const taken = await t.user.findFirst({
      where: { email, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) throw emailTakenError();
    const existing = await t.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (existing && verifyPassword(input.password, existing.passwordHash)) {
      throw validationError("Mật khẩu mới phải khác mật khẩu đang dùng.");
    }
    await t.user.update({
      where: { id: user.id },
      data: {
        email,
        passwordHash: hashPassword(input.password),
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
      },
    });
    await t.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.displayName,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        after: { email, onboarding: true },
        reason: "first-login setup completed",
      },
    });
  });
}

export interface ChangePasswordInput {
  currentPassword: string;
  password: string;
  passwordConfirm: string;
}

/** keepTokenHash: the caller's own session token hash, kept alive. */
export async function changePassword(
  user: SessionUser,
  input: ChangePasswordInput,
  keepTokenHash: string | null,
): Promise<void> {
  const passwordCheck = validateNewPassword(input.password, input.passwordConfirm);
  if (!passwordCheck.ok) throw validationError(passwordCheck.error);

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!row || !verifyPassword(input.currentPassword, row.passwordHash)) {
    throw new MutationError(
      "INVALID_PASSWORD",
      "Mật khẩu hiện tại không đúng.",
      {},
      400,
    );
  }
  if (verifyPassword(input.password, row.passwordHash)) {
    throw validationError("Mật khẩu mới phải khác mật khẩu đang dùng.");
  }

  await prisma.$transaction(async (t) => {
    await t.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(input.password) },
    });
    await t.authSession.deleteMany({
      where: {
        userId: user.id,
        ...(keepTokenHash ? { token: { not: keepTokenHash } } : {}),
      },
    });
    await t.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.displayName,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        reason: "password changed",
      },
    });
  });
}

export interface UpdateEmailInput {
  email: string;
  emailConfirm: string;
  code: string;
}

export async function updateEmail(
  user: SessionUser,
  input: UpdateEmailInput,
): Promise<{ email: string }> {
  const emailCheck = validateEmailAddress(input.email);
  if (!emailCheck.ok) throw validationError(emailCheck.error);
  const confirmCheck = validateEmailConfirmation(input.email, input.emailConfirm);
  if (!confirmCheck.ok) throw validationError(confirmCheck.error);

  const email = normalizeEmail(input.email);
  await consumeVerificationCode({ email, purpose: "EMAIL_CHANGE", code: input.code });
  await prisma.$transaction(async (t) => {
    const taken = await t.user.findFirst({
      where: { email, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) throw emailTakenError();
    await t.user.update({
      where: { id: user.id },
      data: { email, emailVerifiedAt: new Date() },
    });
    await t.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.displayName,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        after: { email },
        reason: "email updated",
      },
    });
  });
  return { email };
}

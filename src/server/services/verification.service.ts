import { randomBytes } from "node:crypto";

import { prisma } from "@/server/db";
import { normalizeEmail } from "@/server/domain/credentials";
import {
  CODE_TTL_MS,
  generateVerificationCode,
  hashVerificationCode,
  isValidVerificationCodeFormat,
  MAX_CODE_ATTEMPTS,
  normalizeVerificationCode,
  RESEND_INTERVAL_MS,
  verificationHashesMatch,
  type VerificationPurpose,
} from "@/server/domain/verification";
import { MutationError } from "@/server/services/timetable-write.service";

/**
 * Persists one-time email verification codes. Codes are bound to
 * (purpose, email), expire after 10 minutes, allow 5 attempts, and cannot be
 * re-requested within 60 seconds. Only the HMAC is stored, so a database
 * snapshot cannot be replayed as a valid code.
 */

const globalForSecret = globalThis as unknown as { verificationSecret?: string };

function verificationSecret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (!globalForSecret.verificationSecret) {
    globalForSecret.verificationSecret = randomBytes(32).toString("hex");
    console.warn(
      "[verification] AUTH_SECRET chưa được cấu hình — mã xác nhận sẽ hết hiệu lực mỗi khi máy chủ khởi động lại.",
    );
  }
  return globalForSecret.verificationSecret;
}

export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

export async function issueVerificationCode(input: {
  email: string;
  purpose: VerificationPurpose;
  userId?: string | null;
}): Promise<IssuedCode> {
  const email = normalizeEmail(input.email);
  const now = Date.now();

  const latest = await prisma.verificationCode.findFirst({
    where: { email, purpose: input.purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest && now - latest.createdAt.getTime() < RESEND_INTERVAL_MS) {
    const retryAfterSeconds = Math.ceil(
      (RESEND_INTERVAL_MS - (now - latest.createdAt.getTime())) / 1000,
    );
    throw new MutationError(
      "RESEND_TOO_SOON",
      `Vui lòng đợi ${retryAfterSeconds} giây trước khi gửi lại mã.`,
      { retryAfterSeconds },
      429,
    );
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(now + CODE_TTL_MS);
  await prisma.$transaction([
    // Only the newest code per (email, purpose) can ever be used.
    prisma.verificationCode.updateMany({
      where: { email, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: new Date(now) },
    }),
    // Opportunistic cleanup of old rows (expired, unused, or consumed).
    prisma.verificationCode.deleteMany({
      where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } },
    }),
    prisma.verificationCode.create({
      data: {
        userId: input.userId ?? null,
        email,
        purpose: input.purpose,
        codeHash: hashVerificationCode(verificationSecret(), input.purpose, email, code),
        expiresAt,
      },
    }),
  ]);
  return { code, expiresAt };
}

/**
 * Verifies and burns the newest code for (email, purpose). Wrong codes
 * increment the attempt counter; after MAX_CODE_ATTEMPTS the code is dead.
 */
export async function consumeVerificationCode(input: {
  email: string;
  purpose: VerificationPurpose;
  code: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const code = normalizeVerificationCode(input.code);
  const invalid = () =>
    new MutationError(
      "INVALID_CODE",
      "Mã xác nhận không đúng hoặc đã hết hạn.",
      {},
      400,
    );

  if (!isValidVerificationCodeFormat(code)) throw invalid();

  const record = await prisma.verificationCode.findFirst({
    where: { email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true, expiresAt: true },
  });
  if (!record) throw invalid();

  if (record.expiresAt.getTime() <= Date.now() || record.attempts >= MAX_CODE_ATTEMPTS) {
    await prisma.verificationCode
      .update({ where: { id: record.id }, data: { consumedAt: new Date() } })
      .catch(() => undefined);
    throw invalid();
  }

  const candidate = hashVerificationCode(verificationSecret(), input.purpose, email, code);
  if (!verificationHashesMatch(candidate, record.codeHash)) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw invalid();
  }

  // Atomic claim: a concurrent request cannot reuse the same code.
  const claimed = await prisma.verificationCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) throw invalid();
}

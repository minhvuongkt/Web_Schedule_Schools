import nodemailer, { type Transporter } from "nodemailer";

import {
  CODE_TTL_MS,
  type VerificationPurpose,
} from "@/server/domain/verification";

/**
 * SMTP delivery (nodemailer) for verification codes. Configuration comes from
 * SMTP_* env vars; when they are missing the app stays usable and callers
 * surface "email chưa được cấu hình" instead of crashing.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password || !Number.isInteger(port) || port <= 0) {
    return null;
  }
  return {
    host,
    port,
    // Port 465 uses implicit TLS; port 587 upgrades with STARTTLS.
    secure: process.env.SMTP_SECURE === "true",
    user,
    password,
    fromName: process.env.SMTP_FROM_NAME?.trim() || "Hệ thống TKB",
    fromEmail: process.env.SMTP_FROM_EMAIL?.trim() || user,
  };
}

export function isMailConfigured(): boolean {
  return smtpConfig() !== null;
}

const globalForMail = globalThis as unknown as {
  mailTransport?: { key: string; transport: Transporter };
};

function transportFor(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}`;
  if (globalForMail.mailTransport?.key !== key) {
    globalForMail.mailTransport = {
      key,
      transport: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: !config.secure,
        auth: { user: config.user, pass: config.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return globalForMail.mailTransport.transport;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const config = smtpConfig();
  if (!config) {
    throw new Error("SMTP chưa được cấu hình (thiếu biến môi trường SMTP_*).");
  }
  await transportFor(config).sendMail({
    from: { name: config.fromName, address: config.fromEmail },
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

const PURPOSE_LABELS: Record<VerificationPurpose, string> = {
  ONBOARDING: "xác nhận email",
  EMAIL_CHANGE: "xác nhận đổi email",
  PASSWORD_RESET: "đặt lại mật khẩu",
};

export async function sendVerificationCodeEmail(
  to: string,
  code: string,
  purpose: VerificationPurpose,
): Promise<void> {
  const minutes = Math.round(CODE_TTL_MS / 60_000);
  const subject = `Mã ${PURPOSE_LABELS[purpose]} — Trường PTDTBT TH & THCS Măng Cành`;
  const text = [
    "Xin chào,",
    "",
    `Mã ${PURPOSE_LABELS[purpose]} của bạn là: ${code}`,
    "",
    `Mã có hiệu lực trong ${minutes} phút và chỉ dùng được một lần.`,
    "Vì lý do an toàn, tuyệt đối không chia sẻ mã này với người khác.",
    "",
    "Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.",
    "",
    "Trường PTDTBT TH & THCS Măng Cành",
  ].join("\n");
  await sendMail({ to, subject, text });
}

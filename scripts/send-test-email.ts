import "dotenv/config";

import { generateVerificationCode } from "../src/server/domain/verification";
import {
  isMailConfigured,
  sendVerificationCodeEmail,
} from "../src/server/services/mail.service";

/**
 * SMTP smoke test — sends a real verification-code email so deployments can
 * confirm the SMTP_* settings in .env.
 *
 *   npm run email:test -- nguoinhan@example.com
 */

async function main(): Promise<void> {
  const to = process.argv[2]?.trim();
  if (!to) {
    console.error("Cách dùng: npm run email:test -- <địa chỉ nhận>");
    process.exitCode = 1;
    return;
  }
  if (!isMailConfigured()) {
    console.error(
      "SMTP chưa được cấu hình: kiểm tra SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD trong .env",
    );
    process.exitCode = 1;
    return;
  }
  const code = generateVerificationCode();
  await sendVerificationCodeEmail(to, code, "ONBOARDING");
  console.log(`Đã gửi email thử (mã minh hoạ ${code}) tới ${to}.`);
}

main().catch((error) => {
  console.error("Gửi email thử thất bại:", error);
  process.exitCode = 1;
});

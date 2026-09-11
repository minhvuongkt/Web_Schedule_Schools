/**
 * Credential rules (pure): shared by the first-login wizard, self-service
 * password change, admin forms and their unit tests. The UI mirrors these
 * messages; keep them in sync.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 160;

export interface CredentialIssue {
  ok: boolean;
  error?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmailAddress(email: string): CredentialIssue {
  const value = email.trim();
  if (value.length === 0) {
    return { ok: false, error: "Vui lòng nhập địa chỉ email." };
  }
  if (value.length > EMAIL_MAX_LENGTH) {
    return { ok: false, error: `Email tối đa ${EMAIL_MAX_LENGTH} ký tự.` };
  }
  if (!EMAIL_PATTERN.test(value)) {
    return {
      ok: false,
      error: "Địa chỉ email không hợp lệ (ví dụ: ten@truong.edu.vn).",
    };
  }
  return { ok: true };
}

export function validateEmailConfirmation(email: string, confirm: string): CredentialIssue {
  if (normalizeEmail(email) !== normalizeEmail(confirm)) {
    return { ok: false, error: "Hai lần nhập email không khớp." };
  }
  return { ok: true };
}

export function validateNewPassword(password: string, confirm: string): CredentialIssue {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.` };
  }
  if (password !== confirm) {
    return { ok: false, error: "Hai lần nhập mật khẩu không khớp." };
  }
  return { ok: true };
}

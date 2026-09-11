"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Icon } from "@/components/ui/icon";
import {
  validateEmailAddress,
  validateEmailConfirmation,
  validateNewPassword,
} from "@/server/domain/credentials";

/**
 * /tai-khoan — self-service account page for every signed-in user:
 * view profile info, change email (verified with an emailed code) and
 * change password.
 */

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 sm:text-sm";

async function send(path: string, method: "POST" | "PATCH", body: unknown): Promise<void> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(data?.error?.message ?? `Lỗi HTTP ${response.status}`);
  }
}

export function AccountApp({
  username,
  displayName,
  roleLabel,
  initialEmail,
}: {
  username: string;
  displayName: string;
  roleLabel: string;
  initialEmail: string;
}) {
  // email form
  const [email, setEmail] = useState(initialEmail);
  const [emailConfirm, setEmailConfirm] = useState(initialEmail);
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSentTo, setEmailCodeSentTo] = useState<string | null>(null);
  const [emailCodeBusy, setEmailCodeBusy] = useState(false);
  const [emailCodeNotice, setEmailCodeNotice] = useState<string | null>(null);
  const [emailResendIn, setEmailResendIn] = useState(0);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  // password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  useEffect(() => {
    if (emailResendIn <= 0) return;
    const timer = setTimeout(() => setEmailResendIn(emailResendIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailResendIn]);

  async function sendEmailCode() {
    const format = validateEmailAddress(email);
    if (!format.ok) return setEmailError(format.error ?? "Email không hợp lệ.");
    const confirm = validateEmailConfirmation(email, emailConfirm);
    if (!confirm.ok) return setEmailError(confirm.error ?? "Email không khớp.");
    setEmailCodeBusy(true);
    setEmailError(null);
    setEmailCodeNotice(null);
    try {
      await send("/api/me/email-code", "POST", { email, purpose: "EMAIL_CHANGE" });
      setEmailCodeSentTo(email.trim().toLowerCase());
      setEmailResendIn(60);
      setEmailCodeNotice(`Đã gửi mã xác nhận tới ${email.trim().toLowerCase()}.`);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Không gửi được mã xác nhận.");
    } finally {
      setEmailCodeBusy(false);
    }
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    const format = validateEmailAddress(email);
    if (!format.ok) return setEmailError(format.error ?? "Email không hợp lệ.");
    const confirm = validateEmailConfirmation(email, emailConfirm);
    if (!confirm.ok) return setEmailError(confirm.error ?? "Email không khớp.");
    if (email.trim().toLowerCase() !== emailCodeSentTo) {
      return setEmailError("Vui lòng gửi mã xác nhận tới email mới trước khi lưu.");
    }
    if (emailCode.replace(/\D/g, "").length !== 6) {
      return setEmailError("Vui lòng nhập mã xác nhận gồm 6 chữ số.");
    }
    setEmailBusy(true);
    setEmailError(null);
    setEmailNotice(null);
    try {
      await send("/api/me", "PATCH", { email, emailConfirm, code: emailCode });
      setEmailNotice("Đã lưu địa chỉ email mới.");
      setEmailCode("");
      setEmailCodeSentTo(null);
      setEmailCodeNotice(null);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Không lưu được email.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    const check = validateNewPassword(password, passwordConfirm);
    if (!check.ok) return setPasswordError(check.error ?? "Mật khẩu không hợp lệ.");
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordNotice(null);
    try {
      await send("/api/me/password", "POST", {
        currentPassword,
        password,
        passwordConfirm,
      });
      setPasswordNotice(
        "Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất vì an toàn.",
      );
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirm("");
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Không đổi được mật khẩu.");
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Tài khoản của tôi
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Xem thông tin, đổi email và đổi mật khẩu đăng nhập của bạn.
        </p>
      </header>

      <section className="mb-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Thông tin tài khoản</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Họ tên</dt>
            <dd className="font-medium text-zinc-900">{displayName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Tên đăng nhập</dt>
            <dd className="font-mono text-zinc-900">{username}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Vai trò</dt>
            <dd className="text-zinc-900">{roleLabel}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Email liên hệ</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Dùng để nhà trường liên hệ và khôi phục tài khoản khi cần. Đổi email
          cần nhập mã xác nhận gửi tới địa chỉ mới.
        </p>
        {emailError ? (
          <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {emailError}
          </p>
        ) : null}
        {emailNotice ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {emailNotice}
          </p>
        ) : null}
        <form onSubmit={saveEmail} className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Email</span>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (e.target.value.trim().toLowerCase() !== emailCodeSentTo) {
                  setEmailCodeSentTo(null);
                  setEmailCodeNotice(null);
                }
              }}
              placeholder="ten@truong.edu.vn"
              autoComplete="email"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">
              Nhập lại email
            </span>
            <input
              type="email"
              className={inputClass}
              value={emailConfirm}
              onChange={(e) => setEmailConfirm(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-zinc-700">
              Mã xác nhận (6 chữ số)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                className={`${inputClass} flex-1 text-center font-mono tracking-[0.4em]`}
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
              />
              <button
                type="button"
                disabled={emailCodeBusy || emailResendIn > 0}
                onClick={() => void sendEmailCode()}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-800 transition hover:bg-blue-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon name="mail" size={15} />
                {emailCodeBusy
                  ? "Đang gửi…"
                  : emailResendIn > 0
                    ? `Gửi lại sau ${emailResendIn}s`
                    : "Gửi mã"}
              </button>
            </div>
            {emailCodeNotice ? (
              <p className="mt-2 text-xs text-emerald-700">{emailCodeNotice}</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={emailBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="check" size={15} />
              {emailBusy ? "Đang lưu…" : "Lưu email"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Đổi mật khẩu</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Mật khẩu tối thiểu 8 ký tự. Sau khi đổi, các thiết bị khác sẽ phải
          đăng nhập lại.
        </p>
        {passwordError ? (
          <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {passwordError}
          </p>
        ) : null}
        {passwordNotice ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {passwordNotice}
          </p>
        ) : null}
        <form onSubmit={savePassword} className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">
              Mật khẩu hiện tại
            </span>
            <input
              type="password"
              className={inputClass}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">
              Mật khẩu mới
            </span>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">
              Nhập lại mật khẩu mới
            </span>
            <input
              type="password"
              className={inputClass}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={passwordBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="key-round" size={15} />
              {passwordBusy ? "Đang đổi…" : "Đổi mật khẩu"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";

import { Icon } from "@/components/ui/icon";
import {
  validateEmailAddress,
  validateEmailConfirmation,
  validateNewPassword,
} from "@/server/domain/credentials";

/**
 * /tai-khoan — self-service account page for every signed-in user:
 * view profile info, change email (double entry) and change password.
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

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    const format = validateEmailAddress(email);
    if (!format.ok) return setEmailError(format.error ?? "Email không hợp lệ.");
    const confirm = validateEmailConfirmation(email, emailConfirm);
    if (!confirm.ok) return setEmailError(confirm.error ?? "Email không khớp.");
    setEmailBusy(true);
    setEmailError(null);
    setEmailNotice(null);
    try {
      await send("/api/me", "PATCH", { email, emailConfirm });
      setEmailNotice("Đã lưu địa chỉ email mới.");
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
          Dùng để nhà trường liên hệ và khôi phục tài khoản khi cần.
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
              onChange={(e) => setEmail(e.target.value)}
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

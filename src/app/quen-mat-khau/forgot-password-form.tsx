"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { Icon } from "@/components/ui/icon";
import {
  validateEmailAddress,
  validateNewPassword,
} from "@/server/domain/credentials";

/**
 * Forgot-password wizard: (1) email → emailed 6-digit code, (2) code + new
 * password. The request endpoint replies generically, so step 2 is always
 * shown even when the address is unknown.
 */

type Step = "email" | "reset" | "done";

const inputClass =
  "mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-900 transition duration-200 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";

async function post(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
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

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    const format = validateEmailAddress(email);
    if (!format.ok) {
      setError(format.error ?? "Email không hợp lệ.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await post("/api/auth/forgot-password", { email });
      setStep("reset");
      setResendIn(60);
      setNotice("Nếu email có trong hệ thống, mã xác nhận đã được gửi đi.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được mã xác nhận.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    const check = validateNewPassword(password, passwordConfirm);
    if (!check.ok) {
      setError(check.error ?? "Mật khẩu không hợp lệ.");
      return;
    }
    if (code.replace(/\D/g, "").length !== 6) {
      setError("Vui lòng nhập mã xác nhận gồm 6 chữ số.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/reset-password", {
        email,
        code,
        password,
        passwordConfirm,
      });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đặt lại được mật khẩu.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Icon name="shield-check" size={24} />
        </span>
        <h2 className="mt-3 text-lg font-semibold text-stone-900">Đặt lại thành công</h2>
        <p className="mt-1 text-sm text-stone-600">
          Mật khẩu mới đã được lưu. Các thiết bị khác đã được đăng xuất vì an toàn.
        </p>
        <Link
          href="/dang-nhap"
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-95"
        >
          <Icon name="login" size={16} />
          Đăng nhập bằng mật khẩu mới
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </p>
      ) : null}
      {notice && !error ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-stone-700">
            Email đã đăng ký
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ten@truong.edu.vn"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-emerald-800 hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Icon name="mail" size={16} />
              {busy ? "Đang gửi mã…" : "Gửi mã xác nhận"}
            </span>
          </button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="space-y-1">
          <label htmlFor="code" className="block text-sm font-medium text-stone-700">
            Mã xác nhận (6 chữ số)
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="••••••"
            className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`}
          />
          <p className="mt-1.5 text-xs text-stone-500">
            Mã đã gửi tới <span className="font-medium text-stone-700">{email}</span>{" "}
            và có hiệu lực 10 phút.
          </p>

          <label htmlFor="password" className="mt-4 block text-sm font-medium text-stone-700">
            Mật khẩu mới
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />

          <label htmlFor="passwordConfirm" className="mt-4 block text-sm font-medium text-stone-700">
            Nhập lại mật khẩu mới
          </label>
          <input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            required
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className={inputClass}
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-emerald-800 hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Icon name="shield-check" size={16} />
              {busy ? "Đang đặt lại…" : "Đặt lại mật khẩu"}
            </span>
          </button>

          <div className="mt-3 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setStep("email");
              }}
              className="font-medium text-stone-500 transition hover:text-stone-800"
            >
              Đổi email khác
            </button>
            <button
              type="button"
              disabled={busy || resendIn > 0}
              onClick={() => void sendCode()}
              className="font-medium text-emerald-700 transition hover:text-emerald-900 disabled:cursor-not-allowed disabled:text-stone-400"
            >
              {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : "Gửi lại mã"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

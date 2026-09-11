"use client";

import { useEffect, useState, type FormEvent } from "react";

import { logoutAction } from "@/app/dang-nhap/actions";
import { Icon } from "@/components/ui/icon";
import {
  validateEmailAddress,
  validateEmailConfirmation,
  validateNewPassword,
} from "@/server/domain/credentials";

/**
 * First-login wizard (every role): 1) email, 2) own password, 3) code sent
 * to that email. Enforced by requireUser until finished; the account email is
 * only stored once a 6-digit code proves the inbox is reachable.
 */

const STEPS = ["Email", "Mật khẩu mới", "Mã xác nhận"];

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:text-sm";

async function postJson(path: string, body: unknown): Promise<void> {
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

export function OnboardingWizard({
  displayName,
  username,
  initialEmail,
  homePath,
}: {
  displayName: string;
  username: string;
  initialEmail: string;
  homePath: string;
}) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState(initialEmail);
  const [emailConfirm, setEmailConfirm] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeNotice, setCodeNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function nextFromEmail(event: FormEvent) {
    event.preventDefault();
    const format = validateEmailAddress(email);
    if (!format.ok) return setError(format.error ?? "Email không hợp lệ.");
    const confirm = validateEmailConfirmation(email, emailConfirm);
    if (!confirm.ok) return setError(confirm.error ?? "Email không khớp.");
    setError(null);
    setStep(1);
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setCodeBusy(true);
    setError(null);
    setCodeNotice(null);
    try {
      await postJson("/api/me/email-code", {
        email,
        purpose: "ONBOARDING",
      });
      setCodeSent(true);
      setResendIn(60);
      setCodeNotice(`Đã gửi mã xác nhận tới ${email.trim().toLowerCase()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được mã xác nhận.");
    } finally {
      setCodeBusy(false);
    }
  }

  function nextFromPassword(event: FormEvent) {
    event.preventDefault();
    const check = validateNewPassword(password, passwordConfirm);
    if (!check.ok) return setError(check.error ?? "Mật khẩu không hợp lệ.");
    setError(null);
    setStep(2);
    if (!codeSent) void sendCode();
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    if (code.replace(/\D/g, "").length !== 6) {
      return setError("Vui lòng nhập mã xác nhận gồm 6 chữ số.");
    }
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/me/onboarding", {
        email,
        emailConfirm,
        code,
        password,
        passwordConfirm,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không hoàn tất được thiết lập.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/60 via-white to-[#FAF7EF]">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-8">
        <header className="mb-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Icon name="graduation-cap" size={24} />
          </span>
          <h1 className="mt-3 text-xl font-bold text-zinc-900">
            Thiết lập tài khoản lần đầu
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {displayName} · <span className="font-mono">{username}</span>
          </p>
        </header>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Icon name="shield-check" size={24} />
            </span>
            <h2 className="mt-3 text-lg font-semibold text-zinc-900">
              Thiết lập hoàn tất
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Email và mật khẩu mới đã được lưu. Từ lần sau bạn đăng nhập bằng
              mật khẩu mới.
            </p>
            <button
              type="button"
              onClick={() => window.location.assign(homePath)}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-95"
            >
              Vào trang làm việc
              <Icon name="arrow-right" size={15} />
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            {/* step indicator */}
            <ol className="mb-5 flex items-center gap-2">
              {STEPS.map((label, index) => {
                const active = index === step;
                const passed = index < step;
                return (
                  <li key={label} className="flex flex-1 items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        passed
                          ? "bg-emerald-600 text-white"
                          : active
                            ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-600"
                            : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {passed ? <Icon name="check" size={14} /> : index + 1}
                    </span>
                    <span
                      className={`hidden text-xs font-medium sm:block ${
                        active ? "text-zinc-900" : "text-zinc-500"
                      }`}
                    >
                      {label}
                    </span>
                    {index < STEPS.length - 1 ? (
                      <span className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {error ? (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
              >
                {error}
              </p>
            ) : null}

            {step === 0 ? (
              <form onSubmit={nextFromEmail} className="space-y-4">
                <p className="text-sm text-zinc-600">
                  Nhập địa chỉ email của bạn để nhà trường liên hệ khi cần thiết.
                </p>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-700">
                    Email
                  </span>
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
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-95"
                >
                  Tiếp tục
                  <Icon name="arrow-right" size={15} />
                </button>
              </form>
            ) : null}

            {step === 1 ? (
              <form onSubmit={nextFromPassword} className="space-y-4">
                <p className="text-sm text-zinc-600">
                  Đặt mật khẩu riêng của bạn (tối thiểu 8 ký tự). Không dùng lại
                  mật khẩu tạm do nhà trường cấp.
                </p>
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep(0);
                    }}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                    <Icon name="arrow-left" size={14} />
                    Quay lại
                  </button>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-95"
                  >
                    Tiếp tục
                    <Icon name="arrow-right" size={15} />
                  </button>
                </div>
              </form>
            ) : null}

            {step === 2 ? (
              <form onSubmit={finish} className="space-y-4">
                <p className="text-sm text-zinc-600">
                  Nhập mã xác nhận gồm 6 chữ số đã gửi tới email của bạn, sau đó
                  hoàn tất thiết lập.
                </p>
                <dl className="space-y-1.5 rounded-lg bg-zinc-50 px-4 py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-zinc-500">Tên đăng nhập</dt>
                    <dd className="font-mono text-zinc-900">{username}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-zinc-500">Email</dt>
                    <dd className="truncate font-medium text-zinc-900">
                      {email.trim().toLowerCase()}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-zinc-500">Mật khẩu mới</dt>
                    <dd className="text-zinc-900">••••••••</dd>
                  </div>
                </dl>

                {codeNotice ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {codeNotice}
                  </p>
                ) : null}

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-700">
                    Mã xác nhận (6 chữ số)
                  </span>
                  <input
                    type="text"
                    className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                  />
                </label>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Mã có hiệu lực 10 phút.</span>
                  <button
                    type="button"
                    disabled={codeBusy || resendIn > 0}
                    onClick={() => void sendCode()}
                    className="font-medium text-emerald-700 transition hover:text-emerald-900 disabled:cursor-not-allowed disabled:text-zinc-400"
                  >
                    {codeBusy
                      ? "Đang gửi…"
                      : resendIn > 0
                        ? `Gửi lại mã sau ${resendIn}s`
                        : "Gửi lại mã"}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setCodeNotice(null);
                      setStep(1);
                    }}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                    <Icon name="arrow-left" size={14} />
                    Quay lại
                  </button>
                  <button
                    type="submit"
                    disabled={busy || codeBusy}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon name="shield-check" size={15} />
                    {busy ? "Đang lưu…" : "Hoàn tất thiết lập"}
                  </button>
                </div>
              </form>
            ) : null}

            <form action={logoutAction} className="mt-5 border-t border-zinc-100 pt-4 text-center">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800"
              >
                <Icon name="logout" size={13} />
                Đăng xuất
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

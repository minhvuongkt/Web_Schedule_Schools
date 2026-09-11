"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "./actions";
import { Icon } from "@/components/ui/icon";

interface LoginFormProps {
  initialNext?: string;
}

export function LoginForm({ initialNext }: LoginFormProps) {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-1">
      {state.error ? (
        <p
          role="alert"
          className="mb-4 animate-fade-up rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {state.error}
        </p>
      ) : null}

      <input type="hidden" name="next" value={initialNext ?? ""} />

      <label htmlFor="username" className="block text-sm font-medium text-stone-700">
        Tên đăng nhập
      </label>
      <input
        id="username"
        name="username"
        type="text"
        required
        autoComplete="username"
        autoFocus
        className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-900 transition duration-200 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
      />

      <div className="mt-4 flex items-center justify-between">
        <label htmlFor="password" className="block text-sm font-medium text-stone-700">
          Mật khẩu
        </label>
        <Link
          href="/quen-mat-khau"
          className="text-xs font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 transition hover:text-emerald-900"
        >
          Quên mật khẩu?
        </Link>
      </div>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-900 transition duration-200 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-emerald-800 hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Icon name="login" size={16} />
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </span>
      </button>
    </form>
  );
}

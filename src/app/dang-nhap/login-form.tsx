"use client";

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

      <label htmlFor="username" className="block text-sm font-medium text-zinc-700">
        Tên đăng nhập
      </label>
      <input
        id="username"
        name="username"
        type="text"
        required
        autoComplete="username"
        autoFocus
        className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 transition duration-200 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
      />

      <label htmlFor="password" className="mt-4 block text-sm font-medium text-zinc-700">
        Mật khẩu
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 transition duration-200 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-blue-800 hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Icon name="login" size={16} />
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </span>
      </button>
    </form>
  );
}

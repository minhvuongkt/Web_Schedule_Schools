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
    <form
      action={formAction}
      className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
    >
      {state.error ? (
        <p
          role="alert"
          className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Icon name="login" size={16} />
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </span>
      </button>
    </form>
  );
}

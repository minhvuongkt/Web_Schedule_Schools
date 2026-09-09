"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { rateLimit } from "@/server/api/rate-limit";
import {
  SESSION_COOKIE,
  login,
  logout,
  sessionCookieOptions,
  AuthenticationError,
  type SessionUser,
} from "@/server/services/auth.service";

const credentialsSchema = z.object({
  username: z.string().trim().min(1, "Vui lòng nhập tên đăng nhập."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
});

export interface LoginActionState {
  error?: string;
}

async function clientKey(): Promise<string> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `login:${ip}`;
}

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const limit = rateLimit(await clientKey(), 10, 15 * 60_000);
  if (!limit.allowed) {
    return { error: "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút." };
  }

  let token: string;
  let user: SessionUser;
  try {
    const result = await login(parsed.data.username, parsed.data.password);
    token = result.token;
    user = result.user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { error: error.message };
    }
    return { error: "Không thể đăng nhập lúc này. Vui lòng thử lại." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());

  const rawNext = String(formData.get("next") ?? "");
  const fallback =
    user.role === "TIMETABLE_ADMIN" || user.role === "SUPER_ADMIN"
      ? "/admin"
      : user.role === "PRINCIPAL"
        ? "/bg"
        : "/gv";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : fallback;
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await logout(token);
  }
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  redirect("/dang-nhap");
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, logout, sessionCookieOptions } from "@/server/services/auth.service";

export async function POST(): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await logout(token);
  }
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return NextResponse.json({ ok: true });
}

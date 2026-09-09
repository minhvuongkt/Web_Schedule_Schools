import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Đăng nhập",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const [{ next }, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) {
    redirect(next && next.startsWith("/") ? next : "/gv");
  }

  const initialNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-sky-800 via-blue-900 to-indigo-950 px-4 py-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-sky-400/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-sky-100 transition hover:text-white"
        >
          <Icon name="arrow-left" size={16} />
          Về trang chủ
        </Link>
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Icon name="calendar" size={24} />
            </span>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Trường PTDTBT TH &amp; THCS Măng Cành
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Đăng nhập</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Dành cho giáo viên và cán bộ quản lý.
            </p>
          </div>
          <LoginForm initialNext={initialNext} />
        </div>
        <p className="mt-4 text-center text-xs text-sky-100/80">
          Học sinh xem thời khóa biểu tại{" "}
          <Link href="/tkb" className="font-medium text-white hover:underline">
            /tkb
          </Link>{" "}
          (không cần đăng nhập).
        </p>
      </div>
    </div>
  );
}

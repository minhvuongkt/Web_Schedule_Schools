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

/** Same paper/notebook identity as the landing page. */
const NOTEBOOK_GRID = {
  backgroundImage:
    "linear-gradient(to right, rgba(22,101,52,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(22,101,52,0.055) 1px, transparent 1px)",
  backgroundSize: "26px 26px",
};

export default async function LoginPage({ searchParams }: PageProps) {
  const [{ next }, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user) {
    redirect(next && next.startsWith("/") ? next : "/gv");
  }

  const initialNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <div
      className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-4 py-16"
      style={{ backgroundColor: "#FAF7EF" }}
    >
      <div className="pointer-events-none absolute inset-0" style={NOTEBOOK_GRID} aria-hidden="true" />
      <div
        className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-emerald-200/50 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-amber-200/60 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 transition hover:text-emerald-800"
        >
          <Icon name="arrow-left" size={16} />
          Về trang chủ
        </Link>
        <div className="rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-stone-900/5">
          <div className="mb-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Icon name="graduation-cap" size={24} />
            </span>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-stone-500">
              Trường PTDTBT TH &amp; THCS Măng Cành
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-stone-900">Đăng nhập</h1>
            <p className="mt-1 text-sm text-stone-600">
              Dành cho giáo viên và cán bộ quản lý.
            </p>
          </div>
          <LoginForm initialNext={initialNext} />
        </div>
        <p className="mt-4 text-center text-xs text-stone-500">
          Học sinh xem thời khóa biểu tại{" "}
          <Link
            href="/tkb"
            className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900"
          >
            /tkb
          </Link>{" "}
          (không cần đăng nhập).
        </p>
      </div>
    </div>
  );
}

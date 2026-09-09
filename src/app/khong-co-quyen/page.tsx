import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Không có quyền truy cập",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ "ly-do"?: string | string[] }>;
}

// Keys must match the reason values used in auth redirects (session.ts).
const REASON_TEXTS_VI: Record<string, string> = {
  "khong-phai-giao-vien": "Tài khoản của bạn không liên kết với giáo viên.",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ForbiddenPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const reason = firstParam(params["ly-do"]);
  const reasonText =
    (reason !== undefined && REASON_TEXTS_VI[reason]) ||
    "Bạn không có quyền truy cập trang này.";

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Không có quyền truy cập
        </h1>
        <p className="mt-2 text-sm text-zinc-600">{reasonText}</p>
        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <Link
            href="/tkb"
            className="font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-600"
          >
            Xem thời khóa biểu
          </Link>
          <Link
            href="/dang-nhap"
            className="font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-600"
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    </main>
  );
}

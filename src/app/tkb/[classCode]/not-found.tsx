import Link from "next/link";

import { PublicFooter, PublicHeader } from "@/components/site/public-chrome";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-gradient-to-b from-emerald-50/60 via-white to-[#FAF7EF]">
      <PublicHeader current="tkb" />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Không tìm thấy lớp
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Lớp bạn yêu cầu không tồn tại trong năm học hiện tại.
          </p>
          <Link
            href="/tkb"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-800 transition-colors hover:border-zinc-500 hover:text-zinc-900"
          >
            ← Chọn lớp khác
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

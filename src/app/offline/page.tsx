import type { Metadata } from "next";

import { LastSynced } from "@/components/pwa/last-synced";
import { RetryButton } from "@/components/pwa/retry-button";

export const metadata: Metadata = {
  title: "Không có kết nối",
};

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Không có kết nối
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          Bạn đang offline. Thời khóa biểu hiển thị là bản đã lưu lần cuối.
        </p>
        <div className="mt-4 text-sm text-zinc-500">
          <LastSynced />
        </div>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <RetryButton />
          {/* Plain anchor on purpose: while offline a next/link soft navigation
              would fetch an RSC payload (network-only in the service worker),
              while a full browser navigation is served from the page cache. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/tkb"
            className="inline-block rounded-md border border-zinc-300 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Xem thời khóa biểu đã lưu
          </a>
        </div>
        <p className="mt-6 text-xs text-zinc-400">
          Trường PTDTBT TH &amp; THCS Măng Cành · Năm học 2026–2027
        </p>
      </div>
    </main>
  );
}

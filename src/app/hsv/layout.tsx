import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { StudentBottomNav } from "@/components/student/student-bottom-nav";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Sổ tay học sinh — Măng Cành",
  description:
    "Thời khóa biểu hôm nay, tuần và thông báo lớp — Trường PTDTBT TH & THCS Măng Cành.",
  manifest: "/hsv.webmanifest",
};

/**
 * Student mini-app shell — deliberately SEPARATE from the public site chrome
 * (no PublicHeader/PublicFooter): students navigate with the bottom nav
 * (Trang chủ / Thời khóa biểu / Thông báo / Hồ sơ), and this slim sticky
 * header only identifies the app. The full site (all classes, search,
 * print-friendly views) lives at /tkb.
 */
export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/60 via-white to-[#FAF7EF]">
      <header className="sticky top-0 z-30 border-b border-emerald-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center justify-between gap-2 px-4">
          <Link
            href="/hsv"
            className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80 active:scale-95"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Icon name="graduation-cap" size={15} />
            </span>
            <span className="truncate text-sm font-bold text-stone-900">Măng Cành</span>
          </Link>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <Icon name="book-open" size={12} />
            Sổ tay học sinh
          </span>
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <div className="flex-1 pb-14">{children}</div>
      </div>
      <StudentBottomNav />
    </div>
  );
}

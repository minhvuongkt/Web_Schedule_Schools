import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StudentBottomNav } from "@/components/student/student-bottom-nav";
import { PublicFooter, PublicHeader } from "@/components/site/public-chrome";

export const metadata: Metadata = {
  title: "Sổ tay học sinh — Măng Cành",
  description:
    "Thời khóa biểu hôm nay, tuần và thông báo lớp — Trường PTDTBT TH & THCS Măng Cành.",
};

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/60 via-white to-[#FAF7EF]">
      <PublicHeader current="hsv" />
      <div className="flex flex-1 flex-col">
        <div className="flex-1 pb-14 md:pb-0">{children}</div>
        <PublicFooter />
      </div>
      <StudentBottomNav />
    </div>
  );
}

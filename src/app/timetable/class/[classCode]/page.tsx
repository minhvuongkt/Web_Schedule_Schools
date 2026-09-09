import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PublicFooter, PublicHeader } from "@/components/site/public-chrome";
import {
  getActiveWeekContext,
  getPublishedTimetableForClass,
} from "@/server/services/timetable-read.service";

interface PageProps {
  params: Promise<{ classCode: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { classCode } = await params;
  return {
    title: `Thời khóa biểu lớp ${classCode.toUpperCase()}`,
    description: `Thoi khoa bieu tuan nay cua lop ${classCode.toUpperCase()} · Trường PTDTBT TH & THCS Măng Cành.`,
  };
}

export const dynamic = "force-dynamic";

export default async function ClassDeepLinkPage({ params }: PageProps) {
  const { classCode } = await params;
  const normalized = classCode.trim().toUpperCase();
  if (normalized !== classCode) {
    redirect(`/timetable/class/${normalized}`);
  }

  const timetable = await getPublishedTimetableForClass(normalized);
  if (!timetable) notFound();

  const { classInfo } = timetable;
  const week = timetable.status === "OK" ? await getActiveWeekContext() : null;
  const weekLabel = week
    ? `Tuần ${String(week.weekNo).padStart(2, "0")} · ${week.weekStart.slice(8, 10)}/${week.weekStart.slice(5, 7)} – ${week.weekEnd.slice(8, 10)}/${week.weekEnd.slice(5, 7)}/${week.weekEnd.slice(0, 4)}`
    : "";

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50 via-white to-zinc-50">
      <PublicHeader current="tkb" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <header className="mb-6">
        <nav className="mb-3 text-sm">
          <Link
            href="/tkb"
            className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:text-blue-900"
          >
            ← Chọn lớp khác
          </Link>
        </nav>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold text-zinc-900">
            Thời khóa biểu lớp {classInfo.code}
          </h1>
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Đã công bố
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {week ? `${weekLabel} · Năm học ${week.schoolYearName} · ${week.schoolName}` : ""}
        </p>
        {classInfo.homeroomTeacherName ? (
          <p className="mt-0.5 text-sm text-zinc-500">
            Giáo viên chủ nhiệm: {classInfo.homeroomTeacherName}
          </p>
        ) : null}
      </header>

      {timetable.status === "NO_PUBLISHED_VERSION" ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
          Thời khóa biểu tuần này chưa được công bố.
        </p>
      ) : (
        <ul className="space-y-3">
          {timetable.days.map((day) => (
            <li key={day.date} className="rounded-lg border border-zinc-200 bg-white">
              <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-zinc-900">{day.dayLabelVi}</h2>
                {day.isToday ? (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    Hôm nay
                  </span>
                ) : null}
              </header>
              <div className="divide-y divide-zinc-100">
                {day.sessions.map((session) => (
                  <div key={session.code} className="px-4 py-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {session.labelVi}
                    </h3>
                    <ul className="space-y-1.5">
                      {session.periods.map((period) => (
                        <li key={period.orderNo} className="flex items-baseline gap-3">
                          <span className="w-24 shrink-0 text-xs tabular-nums text-zinc-500">
                            Tiết {period.orderNo}
                            <span className="block">{period.startTime}</span>
                          </span>
                          {period.lesson ? (
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-zinc-900">
                                {period.lesson.subjectName}
                                {period.lesson.componentName
                                  ? ` (${period.lesson.componentName})`
                                  : ""}
                              </span>
                              <span className="block text-xs text-zinc-500">
                                {period.lesson.teacherName}
                              </span>
                            </span>
                          ) : (
                            <span className="text-sm text-zinc-400">-</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-6 space-y-2 text-xs text-zinc-400">
        <p>
          Lien ket truc tiep (QR):{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5">
            /timetable/class/{classInfo.code}
          </code>
        </p>
        <p>
          <Link href="/tkb" className="hover:underline">
            · Tat ca cac lop
          </Link>
          {" · "}
          <Link href="/hsv" className="hover:underline">
            Sổ tay học sinh
          </Link>
        </p>
      </footer>
      </main>
      <PublicFooter />
    </div>
  );
}

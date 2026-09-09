import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TimetableDayList } from "@/components/timetable/TimetableDayList";
import { TimetableWeekTable } from "@/components/timetable/TimetableWeekTable";
import {
  formatWeekRange,
  sessionStartNote,
} from "@/components/timetable/format";
import { PublicFooter, PublicHeader } from "@/components/site/public-chrome";
import { Icon } from "@/components/ui/icon";
import {
  getActiveWeekContext,
  getPublishedTimetableForClass,
} from "@/server/services/timetable-read.service";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/tkb/[classCode]">,
): Promise<Metadata> {
  const { classCode } = await props.params;
  return { title: `Thời khóa biểu lớp ${classCode.trim().toUpperCase()}` };
}

export default async function ClassTimetablePage(
  props: PageProps<"/tkb/[classCode]">,
) {
  const { classCode } = await props.params;
  const code = classCode.trim().toUpperCase();

  const [context, timetable] = await Promise.all([
    getActiveWeekContext(),
    getPublishedTimetableForClass(code),
  ]);
  if (!timetable) {
    notFound();
  }

  const { classInfo } = timetable;
  const weekLabel = `Thời khóa biểu tuần ${String(context.weekNo).padStart(2, "0")} · ${formatWeekRange(context.weekStart, context.weekEnd)}`;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-gradient-to-b from-sky-50 via-white to-zinc-50">
      <PublicHeader current="tkb" />
      <main className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <header className="mb-6">
          <nav className="no-print mb-3 flex items-center gap-3 text-sm">
            <Link
              href="/tkb"
              className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:text-blue-900"
            >
              <Icon name="arrow-left" size={16} />
              Chọn lớp khác
            </Link>
          </nav>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {context.schoolName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
              Lớp {classInfo.code}
            </h1>
            {timetable.status === "OK" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                <Icon name="check" size={12} />
                Đã công bố
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-600">{weekLabel}</p>
          {classInfo.homeroomTeacherName ? (
            <p className="mt-0.5 text-sm text-zinc-500">
              Giáo viên chủ nhiệm: {classInfo.homeroomTeacherName}
            </p>
          ) : null}
        </header>

        {timetable.status === "NO_PUBLISHED_VERSION" ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
            Thời khóa biểu tuần này chưa được công bố.
          </p>
        ) : timetable.days.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
            Chưa có lịch học nào trong tuần này.
          </p>
        ) : (
          <>
            <TimetableDayList days={timetable.days} />
            <TimetableWeekTable days={timetable.days} />
            <p className="mt-6 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
              {sessionStartNote(timetable.days)}
            </p>
          </>
        )}
      </div>
      </main>
      <PublicFooter />
    </div>
  );
}

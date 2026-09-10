"use client";

import { UiLink } from "@/components/ui/link";
import type { StudentTodayView } from "@/server/services/student-view.service";
import { ClassPicker, useStudentClass } from "@/components/student/class-picker";
import { NextLessonCountdown } from "@/components/student/next-lesson-countdown";
import { StudentDayPeriods } from "@/components/student/student-day-periods";
import { Icon } from "@/components/ui/icon";

interface Props {
  classes: { code: string; grade: number }[];
  initialClass: string | null;
  todayLabel: string;
  view: {
    classInfo: StudentTodayView["classInfo"];
    week: StudentTodayView["week"];
    today: StudentTodayView["today"];
    nextLesson: StudentTodayView["nextLesson"];
    days: StudentTodayView["days"];
  } | null;
}

export function StudentHomeClient({ classes, initialClass, todayLabel, view }: Props) {
  const { selected, onChange } = useStudentClass(initialClass, classes, "/hsv");

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Hôm nay</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{todayLabel}</p>
        </div>
        <ClassPicker classes={classes} selected={selected} onChange={onChange} />
      </header>

      {view && view.week ? (
        <>
          <p className="mb-3 text-xs text-zinc-500">
            {view.classInfo.code} · Tuần {String(view.week.weekNo).padStart(2, "0")} (
            {view.week.weekStart.slice(8, 10)}/{view.week.weekStart.slice(5, 7)} –{" "}
            {view.week.weekEnd.slice(8, 10)}/{view.week.weekEnd.slice(5, 7)}) ·{" "}
            {view.classInfo.homeroomTeacherName
              ? `GVCN: ${view.classInfo.homeroomTeacherName}`
              : ""}
          </p>

          {view.nextLesson ? (
            <section
              aria-label="Tiết kế tiếp"
              className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                <Icon name="clock" size={14} />
                Tiết kế tiếp
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                {view.nextLesson.lesson.subjectName}
                {view.nextLesson.lesson.componentName
                  ? ` (${view.nextLesson.lesson.componentName})`
                  : ""}
              </p>
              <p className="text-sm text-zinc-600">
                Tiết {view.nextLesson.orderNo} · {view.nextLesson.startTime}
                {view.nextLesson.lesson.roomCode ? ` · Phòng ${view.nextLesson.lesson.roomCode}` : ""}
              </p>
              <p className="text-sm text-zinc-600">
                Giáo viên: {view.nextLesson.lesson.teacherName}
              </p>
              <div className="mt-1.5">
                <NextLessonCountdown startTime={view.nextLesson.startTime} />
              </div>
            </section>
          ) : null}

          {view.today ? (
            <section aria-label="Thời khóa biểu hôm nay">
              <h2 className="mb-2 text-sm font-semibold text-zinc-700">
                Hôm nay · {view.today.periods.filter((p) => p.lesson && p.lesson.status !== "CANCELLED").length} tiết
              </h2>
              <StudentDayPeriods periods={view.today.periods} />
            </section>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
              Hôm nay không có tiết học nào.
            </p>
          )}

          <p className="mt-4 text-center text-xs text-zinc-400">
            <UiLink variant="muted" href={`/hsv/thoi-khoa-bieu?lop=${view.classInfo.code}`} className="text-xs">
              Xem cả tuần →
            </UiLink>
          </p>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          Chưa có thời khóa biểu được công bố cho tuần này.
        </p>
      )}
    </div>
  );
}

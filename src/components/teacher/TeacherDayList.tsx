import type { TeacherDayDto } from "@/server/services/teacher-view.service";

import { formatPeriodTime } from "@/components/timetable/format";
import { LessonStatusBadge, formatLessonClass, lessonTextClass } from "./lesson";

export function TeacherDayList({ days }: { days: TeacherDayDto[] }) {
  if (days.length === 0) return null;
  return (
    <div className="space-y-4 lg:hidden">
      {days.map((day) => (
        <section
          key={day.date}
          aria-labelledby={`gv-day-${day.date}`}
          className={`rounded-lg border bg-white p-4 ${
            day.isToday ? "border-amber-400" : "border-zinc-200"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2
              id={`gv-day-${day.date}`}
              className="text-base font-semibold text-zinc-900"
            >
              {day.dayLabelVi}
            </h2>
            <div className="flex shrink-0 items-center gap-1.5">
              {day.isToday ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                  Hôm nay
                </span>
              ) : null}
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                {day.lessonCount} tiết
              </span>
            </div>
          </div>
          {day.sessions.map((session) => (
            <div key={session.code} className="mb-3 last:mb-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {session.labelVi}
              </h3>
              <ol className="divide-y divide-zinc-100">
                {session.periods.map((period) => (
                  <li key={period.orderNo} className="flex gap-3 py-2.5">
                    <div className="w-28 shrink-0">
                      <p className="text-sm font-medium text-zinc-900">
                        Tiết {period.orderNo}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatPeriodTime(period.startTime, period.endTime)}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <p
                        className={`text-sm font-medium text-zinc-900 ${lessonTextClass(period.lesson.status)}`}
                      >
                        {formatLessonClass(period.lesson)}
                      </p>
                      <LessonStatusBadge
                        status={period.lesson.status}
                        substitutingFor={period.lesson.substitutingFor}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

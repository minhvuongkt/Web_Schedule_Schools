import type { DayDto } from "@/server/services/timetable-read.service";

import { formatLessonSubject, formatPeriodTime, subjectTone } from "./format";

export function TimetableDayList({ days }: { days: DayDto[] }) {
  if (days.length === 0) return null;
  return (
    <div className="space-y-4 lg:hidden">
      {days.map((day) => (
        <section
          key={day.date}
          aria-labelledby={`tkb-day-${day.date}`}
          className={`rounded-lg border bg-white p-4 ${
            day.isToday ? "border-amber-400" : "border-zinc-200"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2
              id={`tkb-day-${day.date}`}
              className="text-base font-semibold text-zinc-900"
            >
              {day.dayLabelVi}
            </h2>
            {day.isToday ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                Hôm nay
              </span>
            ) : null}
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
                    <div className="min-w-0 flex-1">
                      {period.lesson ? (
                        <div className="flex gap-2.5">
                          <span
                            className={`mt-0.5 w-1 shrink-0 rounded-full ${subjectTone(period.lesson.subjectName).bar}`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900">
                              {formatLessonSubject(period.lesson)}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {period.lesson.teacherName}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-400">—</p>
                      )}
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

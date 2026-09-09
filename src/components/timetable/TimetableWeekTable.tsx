import type { DayDto, LessonDto } from "@/server/services/timetable-read.service";

import { formatLessonSubject, formatPeriodTime, subjectTone } from "./format";

interface SessionColumn {
  code: string;
  labelVi: string;
  periods: {
    orderNo: number;
    startTime: string;
    endTime: string | null;
  }[];
  cells: Map<string, LessonDto>;
}

// Session order follows first appearance: the service already sorts each
// day's sessions by SessionConfig.orderNo, so Sáng precedes Chiều.
function buildSessionColumns(days: DayDto[]): SessionColumn[] {
  const byCode = new Map<string, SessionColumn>();
  for (const day of days) {
    for (const session of day.sessions) {
      let column = byCode.get(session.code);
      if (!column) {
        column = {
          code: session.code,
          labelVi: session.labelVi,
          periods: [],
          cells: new Map(),
        };
        byCode.set(session.code, column);
      }
      for (const period of session.periods) {
        if (!column.periods.some((p) => p.orderNo === period.orderNo)) {
          column.periods.push({
            orderNo: period.orderNo,
            startTime: period.startTime,
            endTime: period.endTime,
          });
        }
        if (period.lesson) {
          column.cells.set(`${day.date}#${period.orderNo}`, period.lesson);
        }
      }
    }
  }
  const columns = [...byCode.values()];
  for (const column of columns) {
    column.periods.sort((a, b) => a.orderNo - b.orderNo);
  }
  return columns;
}

export function TimetableWeekTable({ days }: { days: DayDto[] }) {
  if (days.length === 0) return null;
  const columns = buildSessionColumns(days);
  if (columns.length === 0) return null;

  return (
    <div className="hidden space-y-8 lg:block">
      {columns.map((column) => (
        <section key={column.code} aria-label={`Buổi ${column.labelVi}`}>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">
            {column.labelVi}
          </h3>
          <div className="overflow-x-auto rounded-lg ring-1 ring-zinc-200">
          <table className="w-full min-w-3xl table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th
                  scope="col"
                  className="w-32 border border-zinc-200 px-2 py-1.5 text-left align-top text-xs font-medium text-zinc-500"
                >
                  Tiết
                </th>
                {days.map((day) => (
                  <th
                    key={day.date}
                    scope="col"
                    className={`border border-zinc-200 px-2 py-1.5 text-center align-top ${
                      day.isToday ? "bg-amber-50" : ""
                    }`}
                  >
                    <span className="block font-semibold text-zinc-900">
                      {day.dayLabelVi}
                    </span>
                    {day.isToday ? (
                      <span className="block text-xs font-medium text-amber-700">
                        Hôm nay
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {column.periods.map((period) => (
                <tr key={period.orderNo} className="bg-white">
                  <th
                    scope="row"
                    className="border border-zinc-200 px-2 py-1.5 text-left align-top"
                  >
                    <span className="block font-medium text-zinc-900">
                      Tiết {period.orderNo}
                    </span>
                    <span className="block text-xs font-normal text-zinc-500">
                      {formatPeriodTime(period.startTime, period.endTime)}
                    </span>
                  </th>
                  {days.map((day) => {
                    const lesson = column.cells.get(
                      `${day.date}#${period.orderNo}`,
                    );
                    return (
                      <td
                        key={day.date}
                        className={`border border-zinc-200 px-2 py-1.5 align-top ${
                          day.isToday ? "bg-amber-50" : ""
                        }`}
                      >
                        {lesson ? (
                          <div className="flex gap-2">
                            <span
                              className={`mt-1 w-1 shrink-0 self-stretch rounded-full ${subjectTone(lesson.subjectName).bar}`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <span className="block font-medium text-zinc-900">
                                {formatLessonSubject(lesson)}
                              </span>
                              <span className="block text-xs text-zinc-500">
                                {lesson.teacherName}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="block text-zinc-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      ))}
    </div>
  );
}

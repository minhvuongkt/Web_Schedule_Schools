import type {
  TeacherDayDto,
  TeacherLessonDto,
} from "@/server/services/teacher-view.service";

import { formatPeriodTime } from "@/components/timetable/format";
import { LessonStatusBadge, formatLessonClass, lessonTextClass } from "./lesson";

interface SessionColumn {
  code: string;
  labelVi: string;
  periods: {
    orderNo: number;
    startTime: string;
    endTime: string | null;
  }[];
  cells: Map<string, TeacherLessonDto>;
}

// Session order follows first appearance: the service already sorts each
// day's sessions by SessionConfig.orderNo, so Sáng precedes Chiều.
function buildSessionColumns(days: TeacherDayDto[]): SessionColumn[] {
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
        column.cells.set(`${day.date}#${period.orderNo}`, period.lesson);
      }
    }
  }
  const columns = [...byCode.values()];
  for (const column of columns) {
    column.periods.sort((a, b) => a.orderNo - b.orderNo);
  }
  return columns;
}

export function TeacherWeekTable({ days }: { days: TeacherDayDto[] }) {
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
                    <span
                      className={`block text-xs font-normal ${
                        day.isToday ? "text-amber-700" : "text-zinc-500"
                      }`}
                    >
                      {day.isToday ? `Hôm nay · ${day.lessonCount} tiết` : `${day.lessonCount} tiết`}
                    </span>
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
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span
                              className={`font-medium text-zinc-900 ${lessonTextClass(lesson.status)}`}
                            >
                              {formatLessonClass(lesson)}
                            </span>
                            <LessonStatusBadge
                              status={lesson.status}
                              substitutingFor={lesson.substitutingFor}
                            />
                          </span>
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

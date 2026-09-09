"use client";

import { useMemo, useState } from "react";

import type { TeacherDayDto } from "@/server/services/teacher-view.service";
import { TeacherDayList } from "@/components/teacher/TeacherDayList";
import { TeacherWeekTable } from "@/components/teacher/TeacherWeekTable";

type ViewMode = "auto" | "list" | "table";

function subjectKey(subjectName: string, componentName: string | null): string {
  return `${subjectName}#${componentName ?? ""}`;
}

function lessonSubjectKey(day: TeacherDayDto): string[] {
  const keys = new Set<string>();
  for (const session of day.sessions) {
    for (const period of session.periods) {
      keys.add(subjectKey(period.lesson.subjectName, period.lesson.componentName));
    }
  }
  return [...keys];
}

interface TeacherTimetableClientProps {
  days: TeacherDayDto[];
}

/**
 * Teacher timetable with class/subject filters and a view switch. "Tự động"
 * keeps the responsive default (list on phones, table on desktop); the other
 * modes force one presentation on every screen.
 */
export function TeacherTimetableClient({ days }: TeacherTimetableClientProps) {
  const [view, setView] = useState<ViewMode>("auto");
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const classOptions = useMemo(() => {
    const classes = new Set<string>();
    for (const day of days) {
      for (const session of day.sessions) {
        for (const period of session.periods) {
          classes.add(period.lesson.className);
        }
      }
    }
    return [...classes].sort((a, b) => a.localeCompare(b));
  }, [days]);

  const subjectOptions = useMemo(() => {
    const keys = new Map<string, { subjectName: string; componentName: string | null }>();
    for (const day of days) {
      for (const key of lessonSubjectKey(day)) {
        if (!keys.has(key)) {
          const [subjectName, componentName] = key.split("#");
          keys.set(key, {
            subjectName,
            componentName: componentName || null,
          });
        }
      }
    }
    return [...keys.entries()].map(([key, value]) => ({ key, ...value }));
  }, [days]);

  const filtering = classFilter !== null || subjectFilter !== null;

  const visibleDays = useMemo(() => {
    if (!filtering) return days;
    return days
      .map((day) => {
        const sessions = day.sessions
          .map((session) => ({
            ...session,
            periods: session.periods.filter((period) => {
              const classOk =
                classFilter === null || period.lesson.className === classFilter;
              const subjectOk =
                subjectFilter === null ||
                subjectKey(
                  period.lesson.subjectName,
                  period.lesson.componentName,
                ) === subjectFilter;
              return classOk && subjectOk;
            }),
          }))
          .filter((session) => session.periods.length > 0);
        return {
          ...day,
          lessonCount: sessions.reduce(
            (total, session) => total + session.periods.length,
            0,
          ),
          sessions,
        };
      })
      .filter((day) => day.sessions.length > 0);
  }, [days, classFilter, subjectFilter, filtering]);

  const clearFilters = () => {
    setClassFilter(null);
    setSubjectFilter(null);
  };

  return (
    <div>
      <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-500">Xem:</span>
            <div
              role="group"
              aria-label="Chế độ hiển thị"
              className="flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5"
            >
              {(
                [
                  ["auto", "Tự động"],
                  ["list", "Danh sách"],
                  ["table", "Bảng"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    view === mode
                      ? "bg-blue-600 text-white"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {classOptions.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-500">Lớp:</span>
              {classOptions.map((classCode) => (
                <button
                  key={classCode}
                  type="button"
                  onClick={() =>
                    setClassFilter((current) =>
                      current === classCode ? null : classCode,
                    )
                  }
                  aria-pressed={classFilter === classCode}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    classFilter === classCode
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  {classCode}
                </button>
              ))}
            </div>
          ) : null}

          {subjectOptions.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-500">Môn:</span>
              {subjectOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() =>
                    setSubjectFilter((current) =>
                      current === option.key ? null : option.key,
                    )
                  }
                  aria-pressed={subjectFilter === option.key}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    subjectFilter === option.key
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  {option.componentName
                    ? `${option.subjectName} (${option.componentName})`
                    : option.subjectName}
                </button>
              ))}
            </div>
          ) : null}

          {filtering ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
            >
              Bỏ lọc
            </button>
          ) : null}
        </div>
      </div>

      {visibleDays.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="text-sm text-zinc-600">
            Không có tiết nào khớp với bộ lọc đã chọn.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 active:scale-[0.98] transition"
          >
            Bỏ lọc
          </button>
        </div>
      ) : (
        <>
          {view === "table" ? null : (
            <TeacherDayList days={visibleDays} forceVisible={view === "list"} />
          )}
          {view === "list" ? null : (
            <TeacherWeekTable days={visibleDays} forceVisible={view === "table"} />
          )}
        </>
      )}
    </div>
  );
}

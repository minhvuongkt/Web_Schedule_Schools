"use client";

import { useState } from "react";
import type { StudentTodayView } from "@/server/services/student-view.service";
import { ClassPicker, useStudentClass } from "@/components/student/class-picker";
import { StudentDayPeriods } from "@/components/student/student-day-periods";
import { Icon } from "@/components/ui/icon";

interface Props {
  classes: { code: string; grade: number }[];
  initialClass: string | null;
  view: {
    classInfo: StudentTodayView["classInfo"];
    week: StudentTodayView["week"];
    days: StudentTodayView["days"];
  } | null;
}

const VI_DAY_SHORT: Record<number, string> = {
  1: "T2",
  2: "T3",
  3: "T4",
  4: "T5",
  5: "T6",
  6: "T7",
  7: "CN",
};

function viShort(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Student schedule page — a focused, single-class week view, deliberately
 * different from the public /tkb pages (which cover every class with tables,
 * search and print views). Here: big day tabs, morning/afternoon groups,
 * the student's own class front and centre. No public site chrome (the
 * layout provides the student app shell + bottom nav).
 */
export function StudentWeekClient({ classes, initialClass, view }: Props) {
  const { selected, onChange } = useStudentClass(initialClass, classes, "/hsv/thoi-khoa-bieu");
  const [activeDay, setActiveDay] = useState<string | null>(null);

  const days = view?.days ?? [];
  const effectiveDay = activeDay ?? days.find((d) => d.isToday)?.date ?? days[0]?.date ?? null;
  const day = days.find((d) => d.date === effectiveDay) ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-stone-900">Thời khóa biểu</h1>
            {view?.week ? (
              <p className="mt-0.5 text-sm text-zinc-500">
                Tuần {String(view.week.weekNo).padStart(2, "0")} · {viShort(view.week.weekStart)} –{" "}
                {viShort(view.week.weekEnd)}
              </p>
            ) : null}
          </div>
          <ClassPicker classes={classes} selected={selected} onChange={onChange} />
        </div>
        {view?.classInfo ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold text-stone-800 ring-1 ring-stone-900/10">
              <Icon name="graduation-cap" size={13} className="text-emerald-700" />
              Lớp {view.classInfo.code}
            </span>
            {view.classInfo.homeroomTeacherName ? (
              <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-stone-900/10">
                GVCN: {view.classInfo.homeroomTeacherName}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      {view && view.week && days.length > 0 ? (
        <>
          {/* Day strip — large touch targets, horizontal scroll */}
          <ul className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
            {days.map((d) => {
              const isActive = d.date === effectiveDay;
              return (
                <li key={d.date} role="tab" aria-selected={isActive}>
                  <button
                    type="button"
                    onClick={() => setActiveDay(d.date)}
                    className={`relative flex min-w-[64px] flex-col items-center rounded-xl border px-3 py-2 text-sm transition duration-150 active:scale-95 ${
                      isActive
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                        : "border-stone-900/10 bg-white text-zinc-600 hover:border-zinc-300"
                    }`}
                  >
                    <span className={`text-[11px] font-medium ${isActive ? "text-emerald-50" : "text-zinc-400"}`}>
                      {VI_DAY_SHORT[d.dayOfWeek]}
                    </span>
                    <span className="text-base font-bold leading-tight tabular-nums">
                      {d.date.slice(8, 10)}
                    </span>
                    {d.isToday ? (
                      <span
                        className={`mt-1 rounded-full px-1.5 text-[9px] font-semibold ${
                          isActive ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        Hôm nay
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {day ? (
            day.periods.length > 0 ? (
              <StudentDayPeriods periods={day.periods} />
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                {day.isToday ? "Hôm nay không có tiết học nào." : "Ngày này không có tiết học nào."}
              </p>
            )
          ) : null}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="text-sm text-zinc-600">
            {view === null && !initialClass
              ? "Chọn lớp của bạn để xem thời khóa biểu."
              : "Chưa có thời khóa biểu được công bố cho tuần này."}
          </p>
          {view === null && !initialClass ? (
            <div className="mt-3 flex justify-center">
              <ClassPicker classes={classes} selected={selected} onChange={onChange} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

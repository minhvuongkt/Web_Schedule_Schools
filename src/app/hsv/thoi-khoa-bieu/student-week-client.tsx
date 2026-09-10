"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StudentTodayView } from "@/server/services/student-view.service";
import { ClassPicker, studentClassStorage } from "@/components/student/class-picker";
import { StudentDayPeriods } from "@/components/student/student-day-periods";

interface Props {
  classes: { code: string; grade: number }[];
  initialClass: string | null;
  view: {
    classInfo: StudentTodayView["classInfo"];
    week: StudentTodayView["week"];
    days: StudentTodayView["days"];
  } | null;
}

const VI_DAY: Record<number, string> = {
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
  7: "Chủ nhật",
};

export function StudentWeekClient({ classes, initialClass, view }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(initialClass);
  const [activeDay, setActiveDay] = useState<string | null>(null);

  useEffect(() => {
    if (initialClass) {
      studentClassStorage().set(initialClass);
      return;
    }
    const stored = studentClassStorage().get();
    if (stored && classes.some((c) => c.code === stored)) {
      router.replace(`/hsv/thoi-khoa-bieu?lop=${encodeURIComponent(stored)}`);
    }
  }, [initialClass, classes, router]);

  const onChange = (code: string) => {
    studentClassStorage().set(code);
    setSelected(code);
    router.push(`/hsv/thoi-khoa-bieu?lop=${encodeURIComponent(code)}`);
  };

  const days = view?.days ?? [];
  const effectiveDay = activeDay ?? days.find((d) => d.isToday)?.date ?? days[0]?.date ?? null;
  const day = days.find((d) => d.date === effectiveDay) ?? null;

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Thời khóa biểu</h1>
          {view?.week ? (
            <p className="mt-0.5 text-sm text-zinc-500">
              {view.classInfo.code} · Tuần {String(view.week.weekNo).padStart(2, "0")}
            </p>
          ) : null}
        </div>
        <ClassPicker classes={classes} selected={selected} onChange={onChange} />
      </header>

      {view && view.week && days.length > 0 ? (
        <>
          {/* Day strip */}
          <ul className="mb-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
            {days.map((d) => (
              <li key={d.date} role="tab" aria-selected={d.date === effectiveDay}>
                <button
                  type="button"
                  onClick={() => setActiveDay(d.date)}
                  className={`flex min-w-[72px] flex-col items-center rounded-lg border px-2 py-1.5 text-xs ${
                    d.date === effectiveDay
                      ? "border-blue-600 bg-blue-50 text-blue-800"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  <span className="font-semibold">{VI_DAY[d.dayOfWeek]}</span>
                  <span className="tabular-nums">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
                  {d.isToday ? (
                    <span className="mt-0.5 rounded bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-800">
                      Hôm nay
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          {day ? (
            <StudentDayPeriods periods={day.periods} />
          ) : null}
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          {view === null && !initialClass
            ? "Chọn lớp của bạn để xem thời khóa biểu."
            : "Chưa có thời khóa biểu được công bố cho tuần này."}
        </p>
      )}
    </div>
  );
}

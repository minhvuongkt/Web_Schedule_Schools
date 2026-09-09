"use client";

import { UiLink } from "@/components/ui/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StudentTodayView } from "@/server/services/student-view.service";
import { ClassPicker, studentClassStorage } from "@/components/student/class-picker";
import { NextLessonCountdown } from "@/components/student/next-lesson-countdown";
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

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  SUBSTITUTED: { label: "Đổi GV", cls: "bg-amber-100 text-amber-900" },
  CANCELLED: { label: "Đã hủy", cls: "bg-zinc-200 text-zinc-600" },
  MAKEUP: { label: "Dạy bù", cls: "bg-blue-100 text-blue-800" },
  MOVED: { label: "Đã dời", cls: "bg-zinc-100 text-zinc-600" },
};

export function StudentHomeClient({ classes, initialClass, todayLabel, view }: Props) {
  const router = useRouter();
  const [selected] = useState<string | null>(initialClass);

  useEffect(() => {
    if (!initialClass) {
      const stored = studentClassStorage().get();
      if (stored && classes.some((c) => c.code === stored)) {
        router.push(`/hsv?lop=${encodeURIComponent(stored)}`);
      }
    }
  }, [initialClass, classes, router]);

  const onChange = (code: string) => {
    studentClassStorage().set(code);
    router.push(`/hsv?lop=${encodeURIComponent(code)}`);
  };

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
              <ul className="space-y-1.5">
                {view.today.periods.map((p) => {
                  const badge = p.lesson ? STATUS_BADGE[p.lesson.status] : undefined;
                  return (
                    <li
                      key={`${p.sessionLabelVi}-${p.orderNo}`}
                      className={`flex items-baseline gap-3 rounded-lg border px-3 py-2.5 ${
                        p.lesson?.status === "CANCELLED"
                          ? "border-zinc-100 bg-zinc-50 opacity-60"
                          : "border-zinc-200 bg-white"
                      }`}
                    >
                      <span className="w-16 shrink-0 text-xs tabular-nums text-zinc-500">
                        Tiết {p.orderNo}
                        <span className="block">{p.startTime}</span>
                      </span>
                      {p.lesson ? (
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-zinc-900">
                            {p.lesson.subjectName}
                            {p.lesson.componentName ? ` (${p.lesson.componentName})` : ""}
                            {badge ? (
                              <span
                                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-xs text-zinc-500">
                            {p.lesson.teacherName}
                            {p.lesson.roomCode ? ` · Phòng ${p.lesson.roomCode}` : ""}
                          </span>
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-400">—</span>
                      )}
                    </li>
                  );
                })}
              </ul>
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

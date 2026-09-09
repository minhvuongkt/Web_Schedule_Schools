"use client";

import { useSyncExternalStore } from "react";

import { formatPeriodTime } from "@/components/timetable/format";
import type { TeacherDayDto } from "@/server/services/teacher-view.service";
import { computeTodayFocus } from "@/components/teacher/today-focus";
import { formatLessonClass } from "@/components/teacher/lesson";

interface TeacherTodayPanelProps {
  /** Today's slice of the teacher's week; null when today has no lessons. */
  day: TeacherDayDto | null;
  /**
   * Minutes since midnight at render time (server clock). Used for the
   * server snapshot so SSR and hydration agree; the client snapshot is the
   * live clock, refreshed every 30 seconds.
   */
  initialMinutes: number;
}

function clientMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const subscribeClock = (onChange: () => void): (() => void) => {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
};

function formatWait(minutes: number): string {
  if (minutes <= 1) return "bắt đầu ngay";
  if (minutes < 60) return `sau ${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `sau ${hours}h${rest > 0 ? rest : ""}`;
}

export function TeacherTodayPanel({
  day,
  initialMinutes,
}: TeacherTodayPanelProps) {
  const minutes = useSyncExternalStore(
    subscribeClock,
    clientMinutes,
    () => initialMinutes,
  );

  const focus = computeTodayFocus(day, minutes);

  return (
    <section
      aria-label="Tiết học hôm nay"
      className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Đang diễn ra
          </p>
          {focus?.current ? (
            <>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {formatLessonClass(focus.current.lesson)}
              </p>
              <p className="text-xs text-zinc-600">
                Tiết {focus.current.periodNo} ·{" "}
                {formatPeriodTime(focus.current.startTime, focus.current.endTime)}
              </p>
            </>
          ) : focus && focus.finished < focus.total ? (
            <p className="mt-1 text-sm text-zinc-600">Nghỉ giữa giờ</p>
          ) : focus && focus.total > 0 ? (
            <p className="mt-1 text-sm text-zinc-600">Đã hết tiết hôm nay</p>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">Hôm nay không có tiết</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Tiết tiếp theo
          </p>
          {focus?.next ? (
            <>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {formatLessonClass(focus.next.lesson)}
              </p>
              <p className="text-xs text-zinc-600">
                Tiết {focus.next.periodNo} ·{" "}
                {formatPeriodTime(focus.next.startTime, focus.next.endTime)} ·{" "}
                {formatWait(focus.minutesToNext ?? 0)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">
              {focus && focus.total > 0
                ? "Đã dạy xong hôm nay"
                : "Không có tiết nào hôm nay"}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Hôm nay
          </p>
          {focus ? (
            <>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {focus.total} tiết dạy
              </p>
              <p className="text-xs text-zinc-600">
                {focus.total - focus.finished} tiết còn lại
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">0 tiết dạy</p>
          )}
        </div>
      </div>
    </section>
  );
}

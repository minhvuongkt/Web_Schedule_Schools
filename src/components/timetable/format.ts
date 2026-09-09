import type { DayDto, LessonDto } from "@/server/services/timetable-read.service";

export function formatDateVi(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const [endYear, endMonth, endDay] = weekEnd.split("-");
  return `${formatDateVi(weekStart)} – ${endDay}/${endMonth}/${endYear}`;
}

export function formatWeekLabel(
  weekNo: number,
  weekStart: string,
  weekEnd: string,
): string {
  return `Tuần ${String(weekNo).padStart(2, "0")} · ${formatWeekRange(weekStart, weekEnd)}`;
}

export function formatPeriodTime(
  startTime: string,
  endTime: string | null,
): string {
  return endTime ? `${startTime}–${endTime}` : startTime;
}

export function formatLessonSubject(lesson: LessonDto): string {
  return lesson.componentName
    ? `${lesson.subjectName} (${lesson.componentName})`
    : lesson.subjectName;
}

export function sessionStartNote(days: DayDto[]): string {
  const starts = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const day of days) {
    for (const session of day.sessions) {
      if (starts.has(session.code) || session.periods.length === 0) continue;
      starts.set(session.code, session.periods[0].startTime);
      labels.set(session.code, session.labelVi);
    }
  }
  if (starts.size === 0) {
    return "Buổi sáng bắt đầu từ 07:00 · Buổi chiều bắt đầu từ 13:00";
  }
  return [...starts.entries()]
    .map(
      ([code, time]) =>
        `Buổi ${(labels.get(code) ?? code).toLowerCase()} bắt đầu từ ${time}`,
    )
    .join(" · ");
}

// Deterministic subject accent color: same subject = same color everywhere
// (landing preview, mobile day list, desktop week table).
const SUBJECT_TONES = [
  { bar: "bg-blue-500", text: "text-blue-800" },
  { bar: "bg-emerald-500", text: "text-emerald-800" },
  { bar: "bg-amber-500", text: "text-amber-800" },
  { bar: "bg-violet-500", text: "text-violet-800" },
  { bar: "bg-rose-500", text: "text-rose-800" },
  { bar: "bg-cyan-500", text: "text-cyan-800" },
  { bar: "bg-orange-500", text: "text-orange-800" },
  { bar: "bg-teal-500", text: "text-teal-800" },
] as const;

export function subjectTone(subjectName: string) {
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = (hash * 31 + subjectName.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_TONES[hash % SUBJECT_TONES.length];
}

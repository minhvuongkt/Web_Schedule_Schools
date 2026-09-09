import type {
  TeacherDayDto,
  TeacherLessonDto,
} from "@/server/services/teacher-view.service";

/**
 * Pure "today focus" logic for the teacher home panel: which lesson is
 * happening now, which is next, and how many remain. Mirrors the domain
 * workload engine's notion of real work: CANCELLED lessons never count and
 * SUBSTITUTED lessons only count for the confirmed substitute.
 */

export interface TodayLesson {
  periodNo: number;
  startTime: string;
  endTime: string | null;
  lesson: TeacherLessonDto;
}

export interface TodayFocus {
  current: TodayLesson | null;
  next: TodayLesson | null;
  /** Teaching lessons already over (endTime passed). */
  finished: number;
  /** Teaching lessons today (CANCELLED/SUBSTITUTED-away excluded). */
  total: number;
  /** Minutes until the next lesson starts; null when none is left today. */
  minutesToNext: number | null;
}

const DEFAULT_LESSON_MINUTES = 45;

export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** True when the teacher actually teaches this lesson slot. */
export function isTeaching(lesson: TeacherLessonDto): boolean {
  if (lesson.status === "CANCELLED") return false;
  if (lesson.status === "SUBSTITUTED" && !lesson.substitutingFor) return false;
  return true;
}

export function flattenDay(day: TeacherDayDto): TodayLesson[] {
  const lessons: TodayLesson[] = [];
  for (const session of day.sessions) {
    for (const period of session.periods) {
      lessons.push({
        periodNo: period.orderNo,
        startTime: period.startTime,
        endTime: period.endTime,
        lesson: period.lesson,
      });
    }
  }
  return lessons;
}

function lessonEnd(lesson: TodayLesson): number {
  return lesson.endTime === null
    ? minutesOf(lesson.startTime) + DEFAULT_LESSON_MINUTES
    : minutesOf(lesson.endTime);
}

export function computeTodayFocus(
  day: TeacherDayDto | null,
  nowMinutes: number,
): TodayFocus | null {
  if (!day) return null;
  const teaching = flattenDay(day)
    .filter((slot) => isTeaching(slot.lesson))
    .sort((a, b) => a.periodNo - b.periodNo || minutesOf(a.startTime) - minutesOf(b.startTime));

  let current: TodayLesson | null = null;
  let next: TodayLesson | null = null;
  let finished = 0;
  for (const slot of teaching) {
    const start = minutesOf(slot.startTime);
    const end = lessonEnd(slot);
    if (end <= nowMinutes) {
      finished += 1;
    } else if (start <= nowMinutes) {
      current = current ?? slot;
    } else {
      next = next ?? slot;
    }
  }

  return {
    current,
    next,
    finished,
    total: teaching.length,
    minutesToNext: next ? minutesOf(next.startTime) - nowMinutes : null,
  };
}

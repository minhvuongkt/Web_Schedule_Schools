import { prisma } from "@/server/db";
import { resolvePublishedContext } from "@/server/services/school-calendar";
import {
  getPublishedTimetableForClass,
  listClasses,
  type ActiveWeekContext,
  type ClassSummary,
  type DayDto,
  type SessionDto,
} from "@/server/services/timetable-read.service";

export interface LandingStats {
  classCount: number;
  teacherCount: number;
  entryCount: number;
  subjectCount: number;
}

export interface LandingPeek {
  classCode: string;
  homeroomTeacherName: string | null;
  days: DayDto[];
  morning: SessionDto | null;
  morningPeriodCount: number;
}

export interface LandingData {
  context: ActiveWeekContext | null;
  classes: ClassSummary[];
  stats: LandingStats | null;
  peek: LandingPeek | null;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export async function getLandingData(): Promise<LandingData> {
  const [classes, year, published] = await Promise.all([
    safe(listClasses, [] as ClassSummary[]),
    safe(
      () =>
        prisma.schoolYear.findFirst({
          where: { status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            schoolId: true,
            school: { select: { name: true } },
          },
          orderBy: [{ startDate: "desc" }, { name: "desc" }],
        }),
      null,
    ),
    safe(resolvePublishedContext, null),
  ]);

  const context: ActiveWeekContext | null = year && published
    ? {
        schoolName: year.school.name,
        schoolYearName: year.name,
        weekNo: published.week.weekNo,
        weekStart: published.week.weekStart,
        weekEnd: published.week.weekEnd,
      }
    : null;

  const stats: LandingStats | null = await safe(async () => {
    if (!year) return null;
    const [teacherCount, subjectCount, entryCount] = await Promise.all([
      prisma.teacher.count({ where: { schoolId: year.schoolId, isActive: true } }),
      prisma.subject.count({ where: { schoolId: year.schoolId } }),
      published
        ? prisma.timetableEntry.count({
            where: { versionId: published.versionId, status: { not: "CANCELLED" } },
          })
        : Promise.resolve(0),
    ]);
    return {
      classCount: classes.length,
      teacherCount,
      subjectCount,
      entryCount,
    };
  }, null);

  const peek: LandingPeek | null = await safe(async () => {
    const first = classes[0];
    if (!first) return null;
    const timetable = await getPublishedTimetableForClass(first.code);
    if (!timetable || timetable.status !== "OK" || timetable.days.length === 0) return null;
    const morning =
      timetable.days[0].sessions.find((s) => s.labelVi.toLowerCase().includes("sáng")) ??
      timetable.days[0].sessions[0] ??
      null;
    return {
      classCode: first.code,
      homeroomTeacherName: first.homeroomTeacherName,
      days: timetable.days,
      morning,
      morningPeriodCount: morning ? morning.periods.length : 0,
    };
  }, null);

  return { context, classes, stats, peek };
}

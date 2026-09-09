import { prisma } from "@/server/db";
import {
  dateToIso,
  dayLabelVi,
  findActiveSchoolYear,
  resolveActiveWeek,
  todayIso,
} from "@/server/services/school-calendar";

export interface ClassSummary {
  id: string;
  code: string;
  grade: number;
  homeroomTeacherName: string | null;
}

export interface ActiveWeekContext {
  schoolName: string;
  schoolYearName: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
}

export interface ClassInfo {
  code: string;
  grade: number;
  homeroomTeacherName: string | null;
}

export interface LessonDto {
  subjectName: string;
  componentName: string | null;
  teacherName: string;
}

export interface PeriodDto {
  orderNo: number;
  startTime: string;
  endTime: string | null;
  lesson: LessonDto | null;
}

export interface SessionDto {
  code: string;
  labelVi: string;
  periods: PeriodDto[];
}

export interface DayDto {
  date: string;
  dayOfWeek: number;
  dayLabelVi: string;
  isToday: boolean;
  sessions: SessionDto[];
}

export type PublishedClassTimetable =
  | { status: "NO_PUBLISHED_VERSION"; classInfo: ClassInfo }
  | { status: "OK"; classInfo: ClassInfo; days: DayDto[] };

export async function listClasses(): Promise<ClassSummary[]> {
  const year = await findActiveSchoolYear();
  if (!year) return [];
  const classes = await prisma.class.findMany({
    where: { schoolYearId: year.id },
    select: {
      id: true,
      code: true,
      grade: true,
      homeroomTeacher: { select: { fullName: true } },
    },
    orderBy: [{ grade: "asc" }, { code: "asc" }],
  });
  return classes.map((cls) => ({
    id: cls.id,
    code: cls.code,
    grade: cls.grade,
    homeroomTeacherName: cls.homeroomTeacher?.fullName ?? null,
  }));
}

export async function getActiveWeekContext(): Promise<ActiveWeekContext> {
  const year = await findActiveSchoolYear();
  if (!year) throw new Error("No ACTIVE school year found in database");
  const week = await resolveActiveWeek(year.id, todayIso());
  if (!week) throw new Error(`No week found for school year ${year.name}`);
  return {
    schoolName: year.schoolName,
    schoolYearName: year.name,
    weekNo: week.weekNo,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
  };
}

export async function getPublishedTimetableForClass(
  classCode: string,
): Promise<PublishedClassTimetable | null> {
  const code = classCode.trim().toUpperCase();
  if (!code) return null;
  const year = await findActiveSchoolYear();
  if (!year) return null;

  const cls = await prisma.class.findFirst({
    where: { schoolYearId: year.id, code },
    include: { homeroomTeacher: { select: { fullName: true } } },
  });
  if (!cls) return null;

  const classInfo: ClassInfo = {
    code: cls.code,
    grade: cls.grade,
    homeroomTeacherName: cls.homeroomTeacher?.fullName ?? null,
  };

  const today = todayIso();
  const week = await resolveActiveWeek(year.id, today);
  if (!week) return { status: "NO_PUBLISHED_VERSION", classInfo };

  const version = await prisma.timetableVersion.findFirst({
    where: { weekId: week.id, status: "PUBLISHED" },
    orderBy: [{ versionNo: "desc" }, { id: "asc" }],
  });
  if (!version) return { status: "NO_PUBLISHED_VERSION", classInfo };

  // CANCELLED lessons are dropped: in the compact view their slot disappears.
  // SUBSTITUTED lessons keep the slot and show the CONFIRMED substitute
  // teacher — that is who the class actually sees.
  const entries = await prisma.timetableEntry.findMany({
    where: {
      versionId: version.id,
      classId: cls.id,
      status: { not: "CANCELLED" },
    },
    include: {
      subject: { select: { name: true } },
      subjectComponent: { select: { name: true } },
      teacher: { select: { fullName: true } },
      substitution: {
        select: { status: true, substituteTeacher: { select: { fullName: true } } },
      },
      period: {
        select: {
          orderNo: true,
          startTime: true,
          endTime: true,
          session: { select: { code: true, labelVi: true, orderNo: true } },
        },
      },
      academicDay: { select: { date: true, dayOfWeek: true } },
    },
    orderBy: [
      { academicDay: { date: "asc" } },
      { period: { session: { orderNo: "asc" } } },
      { period: { orderNo: "asc" } },
    ],
  });

  const daysByDate = new Map<string, DayDto>();
  const sessionOrder = new Map<string, number>();
  for (const entry of entries) {
    const date = dateToIso(entry.academicDay.date);
    let day = daysByDate.get(date);
    if (!day) {
      day = {
        date,
        dayOfWeek: entry.academicDay.dayOfWeek,
        dayLabelVi: dayLabelVi(entry.academicDay.dayOfWeek, date),
        isToday: date === today,
        sessions: [],
      };
      daysByDate.set(date, day);
    }

    const session = entry.period.session;
    sessionOrder.set(session.code, session.orderNo);
    let sessionDto = day.sessions.find((s) => s.code === session.code);
    if (!sessionDto) {
      sessionDto = { code: session.code, labelVi: session.labelVi, periods: [] };
      day.sessions.push(sessionDto);
    }

    sessionDto.periods.push({
      orderNo: entry.period.orderNo,
      startTime: entry.period.startTime,
      endTime: entry.period.endTime,
      lesson: {
        subjectName: entry.subject.name,
        componentName: entry.subjectComponent?.name ?? null,
        teacherName:
          entry.status === "SUBSTITUTED" &&
          entry.substitution?.status === "CONFIRMED"
            ? entry.substitution.substituteTeacher.fullName
            : entry.teacher.fullName,
      },
    });
  }

  const days = [...daysByDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  for (const day of days) {
    day.sessions.sort(
      (a, b) =>
        (sessionOrder.get(a.code) ?? 0) - (sessionOrder.get(b.code) ?? 0),
    );
    for (const session of day.sessions) {
      session.periods.sort((a, b) => a.orderNo - b.orderNo);
    }
  }

  return { status: "OK", classInfo, days };
}

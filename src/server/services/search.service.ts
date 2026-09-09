import { prisma } from "@/server/db";
import { diacriticFreeKey } from "@/server/domain/normalize";
import { resolvePublishedContext, dayLabelVi } from "@/server/services/school-calendar";

/**
 * Server-side public search (spec §21): classes, subjects, teacher display
 * names — diacritics-insensitive. Rich results: each hit carries the
 * published week context and, where applicable, the concrete schedule
 * details (day, date, period, time, class, subject, teacher, substitution
 * state) so the results page can show "the more detail the better".
 *
 * Security: only fields already shown on public timetable pages (names,
 * codes, schedule slots) — never workload/assignment internals.
 */

export interface SearchLesson {
  dayLabelVi: string; // "Thứ 2 · 07/09"
  date: string; // ISO
  periodOrderNo: number;
  startTime: string;
  endTime: string | null;
  sessionLabelVi: string;
  className: string;
  subjectName: string;
  componentName: string | null;
  teacherName: string; // effective teacher (substitute when CONFIRMED)
  status: string;
}

export interface SearchHit {
  type: "class" | "subject" | "teacher";
  key: string;
  title: string;
  subtitle: string;
  href: string | null;
  /** Effective teacher for CONFIRMED substitutions, else the assigned one. */
  lessons?: SearchLesson[];
  lessonCount?: number;
}

const MAX_LESSONS = 12;

const ISO = (d: Date) => {
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
};

const VI_DAY = (dow: number) => (dow === 7 ? "Chủ nhật" : `Thứ ${dow + 1}`);
const VI_DATE = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

interface LessonRow {
  academicDayId: string;
  date: Date;
  dayOfWeek: number;
  periodId: string;
  periodOrderNo: number;
  startTime: string;
  endTime: string | null;
  sessionLabelVi: string;
  sessionOrderNo: number;
  classId: string;
  classCode: string;
  subjectId: string;
  subjectName: string;
  componentName: string | null;
  teacherId: string;
  teacherName: string;
  status: string;
  substituteName: string | null;
}

async function loadPublishedLessons(): Promise<{
  versionId: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
  rows: LessonRow[];
}> {
  const context = await resolvePublishedContext();
  if (!context) {
    return { versionId: "", weekNo: 0, weekStart: "", weekEnd: "", rows: [] };
  }
  const rows = await prisma.timetableEntry.findMany({
    where: { versionId: context.versionId, status: { not: "CANCELLED" } },
    select: {
      academicDayId: true,
      academicDay: { select: { date: true, dayOfWeek: true } },
      period: {
        select: {
          id: true,
          orderNo: true,
          startTime: true,
          endTime: true,
          session: { select: { labelVi: true, orderNo: true } },
        },
      },
      classId: true,
      class: { select: { code: true } },
      subjectId: true,
      subject: { select: { name: true } },
      subjectComponent: { select: { name: true } },
      teacherId: true,
      teacher: { select: { fullName: true } },
      status: true,
      substitution: {
        select: {
          status: true,
          substituteTeacher: { select: { fullName: true } },
        },
      },
    },
    orderBy: [
      { academicDay: { date: "asc" } },
      { period: { session: { orderNo: "asc" } } },
      { period: { orderNo: "asc" } },
    ],
  });

  return {
    versionId: context.versionId,
    weekNo: context.week.weekNo,
    weekStart: context.week.weekStart,
    weekEnd: context.week.weekEnd,
    rows: rows.map((r) => ({
      academicDayId: r.academicDayId,
      date: r.academicDay.date,
      dayOfWeek: r.academicDay.dayOfWeek,
      periodId: r.period.id,
      periodOrderNo: r.period.orderNo,
      startTime: r.period.startTime,
      endTime: r.period.endTime,
      sessionLabelVi: r.period.session.labelVi,
      sessionOrderNo: r.period.session.orderNo,
      classId: r.classId,
      classCode: r.class.code,
      subjectId: r.subjectId,
      subjectName: r.subject.name,
      componentName: r.subjectComponent?.name ?? null,
      teacherId: r.teacherId,
      teacherName: r.teacher.fullName,
      status: r.status,
      substituteName:
        r.status === "SUBSTITUTED" && r.substitution?.status === "CONFIRMED"
          ? r.substitution.substituteTeacher.fullName
          : null,
    })),
  };
}

function toLessons(rows: LessonRow[]): SearchLesson[] {
  return rows.map((r) => ({
    dayLabelVi: dayLabelVi(r.dayOfWeek, ISO(r.date)),
    date: ISO(r.date),
    periodOrderNo: r.periodOrderNo,
    startTime: r.startTime,
    endTime: r.endTime,
    sessionLabelVi: r.sessionLabelVi,
    className: r.classCode,
    subjectName: r.subjectName,
    componentName: r.componentName,
    teacherName: r.substituteName ?? r.teacherName,
    status: r.status,
  }));
}

export async function globalSearch(rawQuery: string): Promise<{
  query: string;
  week: { weekNo: number; weekStart: string; weekEnd: string } | null;
  hits: SearchHit[];
}> {
  const q = rawQuery.trim();
  if (q.length < 2) {
    return { query: q, week: null, hits: [] };
  }
  const key = diacriticFreeKey(q);

  const [classes, subjects, teachers, lessons] = await Promise.all([
    prisma.class.findMany({
      where: { schoolYear: { status: "ACTIVE" } },
      select: { id: true, code: true, grade: true, homeroomTeacher: { select: { fullName: true } } },
      orderBy: [{ grade: "asc" }, { code: "asc" }],
    }),
    prisma.subject.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        components: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      select: { id: true, code: true, fullName: true, position: true },
      orderBy: { code: "asc" },
    }),
    loadPublishedLessons(),
  ]);

  const hits: SearchHit[] = [];
  const week =
    lessons.versionId !== ""
      ? { weekNo: lessons.weekNo, weekStart: lessons.weekStart, weekEnd: lessons.weekEnd }
      : null;

  // --- classes: lessons of that class ---
  for (const c of classes) {
    if (!diacriticFreeKey(c.code).includes(key)) continue;
    const rows = lessons.rows.filter((r) => r.classId === c.id);
    hits.push({
      type: "class",
      key: c.code,
      title: `Lớp ${c.code}`,
      subtitle: `Khối ${c.grade}${c.homeroomTeacher ? ` · GVCN ${c.homeroomTeacher.fullName}` : ""} · ${rows.length} tiết/tuần`,
      href: `/tkb/${c.code}`,
      lessons: toLessons(rows.slice(0, MAX_LESSONS)),
      lessonCount: rows.length,
    });
  }

  // --- subjects: occurrences across classes ---
  for (const s of subjects) {
    if (!diacriticFreeKey(s.name).includes(key) && !diacriticFreeKey(s.code).includes(key)) {
      continue;
    }
    const rows = lessons.rows.filter((r) => r.subjectId === s.id);
    const classCount = new Set(rows.map((r) => r.classCode)).size;
    hits.push({
      type: "subject",
      key: s.code,
      title: s.name,
      subtitle:
        s.components.length > 0
          ? `${s.components.map((comp) => comp.name).join(", ")} · ${rows.length} tiết/tuần · ${classCount} lớp`
          : `${rows.length} tiết/tuần · ${classCount} lớp`,
      href: null,
      lessons: toLessons(rows.slice(0, MAX_LESSONS)),
      lessonCount: rows.length,
    });
  }

  // --- teachers: their published lessons (effective — includes confirmed
  // substitutions they cover) ---
  for (const t of teachers) {
    if (
      !diacriticFreeKey(t.fullName).includes(key) &&
      !diacriticFreeKey(t.code).includes(key)
    ) {
      continue;
    }
    const rows = lessons.rows.filter((r) => r.teacherId === t.id);
    const effective = rows.map((r) => ({
      ...r,
      teacherName: r.teacherName,
    }));
    hits.push({
      type: "teacher",
      key: t.id,
      title: t.fullName,
      subtitle: `${t.code}${t.position ? ` · ${t.position}` : ""} · ${rows.length} tiết/tuần`,
      href: null,
      lessons: toLessons(effective.slice(0, MAX_LESSONS)),
      lessonCount: rows.length,
    });
  }

  return { query: q, week, hits: hits.slice(0, 12) };
}

export const searchFormat = { VI_DAY, VI_DATE, ISO };

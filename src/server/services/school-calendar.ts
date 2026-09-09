import { prisma } from "@/server/db";

/**
 * Shared calendar-context resolution for read services. Single source of
 * truth for: active school year, active week (today in Asia/Ho_Chi_Minh,
 * else latest week with a PUBLISHED version), and the PUBLISHED timetable
 * version (highest versionNo) — so public and teacher views can never drift
 * on which version is authoritative (drafts are never resolved here).
 */

// pg's DATE parser returns local-midnight Dates, so ISO strings must be built
// from local getters — toISOString() would shift the day on non-UTC hosts.
export function dateToIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today (YYYY-MM-DD) in the school's timezone. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

/** ISO weekday 1=Mon..7=Sun → Vietnamese: Mon=Thứ 2 … Sat=Thứ 7, Sun=Chủ nhật. */
export function dayLabelVi(dayOfWeek: number, dateIso: string): string {
  const weekday = dayOfWeek === 7 ? "Chủ nhật" : `Thứ ${dayOfWeek + 1}`;
  const [, month, day] = dateIso.split("-");
  return `${weekday} · ${day}/${month}`;
}

export interface ActiveSchoolYear {
  id: string;
  name: string;
  schoolName: string;
}

export async function findActiveSchoolYear(): Promise<ActiveSchoolYear | null> {
  const year = await prisma.schoolYear.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, school: { select: { name: true } } },
    orderBy: [{ startDate: "desc" }, { name: "desc" }],
  });
  if (!year) return null;
  return { id: year.id, name: year.name, schoolName: year.school.name };
}

function weeksOfYear(schoolYearId: string) {
  return { OR: [{ schoolYearId }, { semester: { schoolYearId } }] };
}

export interface ActiveWeekRecord {
  id: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
}

/** Week containing today, else latest week with a PUBLISHED version. */
export async function resolveActiveWeek(
  schoolYearId: string,
  today: string,
): Promise<ActiveWeekRecord | null> {
  const todayBound = new Date(`${today}T00:00:00.000Z`);
  const current = await prisma.week.findFirst({
    where: {
      ...weeksOfYear(schoolYearId),
      startDate: { lte: todayBound },
      endDate: { gte: todayBound },
    },
    orderBy: [{ weekNo: "asc" }, { id: "asc" }],
  });
  if (current) {
    return {
      id: current.id,
      weekNo: current.weekNo,
      weekStart: dateToIso(current.startDate),
      weekEnd: dateToIso(current.endDate),
    };
  }
  const fallback = await prisma.week.findFirst({
    where: {
      ...weeksOfYear(schoolYearId),
      versions: { some: { status: "PUBLISHED" } },
    },
    orderBy: [{ weekNo: "desc" }, { id: "asc" }],
  });
  if (!fallback) return null;
  return {
    id: fallback.id,
    weekNo: fallback.weekNo,
    weekStart: dateToIso(fallback.startDate),
    weekEnd: dateToIso(fallback.endDate),
  };
}

export interface PublishedWeekContext {
  year: ActiveSchoolYear;
  week: ActiveWeekRecord;
  versionId: string;
}

/** Active week + highest versionNo PUBLISHED version (never a draft). */
export async function resolvePublishedContext(): Promise<PublishedWeekContext | null> {
  const year = await findActiveSchoolYear();
  if (!year) return null;
  const week = await resolveActiveWeek(year.id, todayIso());
  if (!week) return null;
  const version = await prisma.timetableVersion.findFirst({
    where: { weekId: week.id, status: "PUBLISHED" },
    orderBy: [{ versionNo: "desc" }, { id: "asc" }],
  });
  if (!version) return null;
  return { year, week, versionId: version.id };
}

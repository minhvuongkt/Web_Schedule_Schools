import { prisma } from "@/server/db";
import { resolvePublishedContext, todayIso } from "@/server/services/school-calendar";

/**
 * Public student app data (no login). SECURITY: every query resolves the
 * week's PUBLISHED version only and exposes class-level schedule fields —
 * never teacher workload/assignment internals (spec §4).
 */

export interface StudentLesson {
  subjectName: string;
  componentName: string | null;
  teacherName: string;
  roomId: string | null;
  roomCode: string | null;
  status: string;
}

export interface StudentPeriod {
  orderNo: number;
  startTime: string;
  endTime: string | null;
  sessionLabelVi: string;
  lesson: StudentLesson | null;
}

export interface StudentDay {
  date: string;
  dayOfWeek: number;
  dayLabelVi: string;
  isToday: boolean;
  periods: StudentPeriod[];
}

export interface StudentTodayView {
  classInfo: { code: string; grade: number; homeroomTeacherName: string | null };
  week: { weekNo: number; weekStart: string; weekEnd: string; schoolName: string; schoolYearName: string } | null;
  today: StudentDay | null;
  /** Next upcoming lesson from NOW (Vietnam time); null when none today. */
  nextLesson: (StudentPeriod & { lesson: StudentLesson; dayLabelVi: string }) | null;
  days: StudentDay[];
}

const VI_DAY = (dow: number) => (dow === 7 ? "Chủ nhật" : `Thứ ${dow + 1}`);


export function vietnamNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { date: todayIso(), minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export async function getStudentTodayView(
  classCode: string,
): Promise<StudentTodayView | null> {
  const code = classCode.trim().toUpperCase();
  if (!code) return null;

  const context = await resolvePublishedContext();
  const cls = await prisma.class.findFirst({
    where: { code, schoolYear: { status: "ACTIVE" } },
    include: { homeroomTeacher: { select: { fullName: true } } },
  });
  if (!cls) return null;

  const classInfo = {
    code: cls.code,
    grade: cls.grade,
    homeroomTeacherName: cls.homeroomTeacher?.fullName ?? null,
  };

  if (!context) {
    return { classInfo, week: null, today: null, nextLesson: null, days: [] };
  }

  const week = {
    weekNo: context.week.weekNo,
    weekStart: context.week.weekStart,
    weekEnd: context.week.weekEnd,
    schoolName: context.year.schoolName,
    schoolYearName: context.year.name,
  };

  const entries = await prisma.timetableEntry.findMany({
    where: { versionId: context.versionId, classId: cls.id },
    include: {
      subject: { select: { name: true } },
      subjectComponent: { select: { name: true } },
      teacher: { select: { fullName: true } },
      substitution: {
        select: { status: true, substituteTeacher: { select: { fullName: true } } },
      },
      room: { select: { code: true } },
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

  const now = vietnamNow();
  const dayMap = new Map<string, StudentDay>();
  for (const entry of entries) {
    const date = isoOf(entry.academicDay.date);
    let day = dayMap.get(date);
    if (!day) {
      day = {
        date,
        dayOfWeek: entry.academicDay.dayOfWeek,
        dayLabelVi: VI_DAY(entry.academicDay.dayOfWeek),
        isToday: date === now.date,
        periods: [],
      };
      dayMap.set(date, day);
    }
    const isSubstituted =
      entry.status === "SUBSTITUTED" && entry.substitution?.status === "CONFIRMED";
    day.periods.push({
      orderNo: entry.period.orderNo,
      startTime: entry.period.startTime,
      endTime: entry.period.endTime,
      sessionLabelVi: entry.period.session.labelVi,
      lesson: {
        subjectName: entry.subject.name,
        componentName: entry.subjectComponent?.name ?? null,
        teacherName: isSubstituted
          ? entry.substitution!.substituteTeacher.fullName
          : entry.teacher.fullName,
        roomId: entry.roomId,
        roomCode: entry.room?.code ?? null,
        status: entry.status,
      },
    });
  }

  const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const today = days.find((d) => d.date === now.date) ?? null;

  // Next lesson: first period TODAY whose start time is still ahead of now
  // (CANCELLED lessons are skipped — they don't take place).
  let nextLesson: StudentTodayView["nextLesson"] = null;
  if (today) {
    const upcoming = today.periods
      .filter((p) => p.lesson && p.lesson.status !== "CANCELLED")
      .filter((p) => toMinutes(p.startTime) >= now.minutes)
      .sort((a, b) => a.orderNo - b.orderNo);
    if (upcoming.length > 0 && upcoming[0].lesson) {
      nextLesson = { ...upcoming[0], lesson: upcoming[0].lesson, dayLabelVi: today.dayLabelVi };
    }
  }

  return { classInfo, week, today, nextLesson, days };
}

function isoOf(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Public class notifications (only published-state changes affecting a class)
// ---------------------------------------------------------------------------

export interface StudentNotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

const CLASS_NOTIFICATION_TYPES = new Set([
  "TIMETABLE_PUBLISHED",
  "TEACHER_CHANGED",
  "ROOM_CHANGED",
  "LESSON_CANCELLED",
  "MAKEUP_LESSON_CREATED",
]);

export async function getClassNotifications(
  classCode: string,
  limit = 30,
): Promise<StudentNotificationItem[]> {
  const code = classCode.trim().toUpperCase();
  if (!code) return [];
  const cls = await prisma.class.findFirst({
    where: { code, schoolYear: { status: "ACTIVE" } },
    select: { id: true },
  });
  if (!cls) return [];

  const rows = await prisma.notification.findMany({
    where: {
      type: { in: [...CLASS_NOTIFICATION_TYPES] },
      payload: { path: ["classId"], equals: cls.id },
    },
    select: { id: true, type: true, title: true, body: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

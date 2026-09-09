import { prisma } from "@/server/db";
import {
  computeTeacherWorkloads,
  type WorkloadAssignmentInput,
  type WorkloadSubstitutionInput,
} from "@/server/domain/workload";
import {
  dateToIso,
  dayLabelVi,
  findActiveSchoolYear,
  resolvePublishedContext,
  todayIso,
  type PublishedWeekContext,
} from "@/server/services/school-calendar";

/**
 * Teacher's personal view: own PUBLISHED timetable + own workload numbers.
 * Security invariants: PUBLISHED versions only (never drafts), own data only
 * (never other teachers' workloads), all lesson counts computed by the domain
 * workload engine — no workload math in the UI.
 */

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface TeacherInfoDto {
  code: string;
  fullName: string;
  position: string | null;
  departmentName: string | null;
}

export interface TeacherWeekDto {
  weekNo: number;
  weekStart: string;
  weekEnd: string;
  schoolYearName: string;
  schoolName: string;
}

export interface TeacherLessonDto {
  className: string;
  subjectName: string;
  componentName: string | null;
  status: string;
  /** Set when this teacher is the CONFIRMED substitute for the lesson. */
  substitutingFor: string | null;
}

export interface TeacherPeriodDto {
  orderNo: number;
  startTime: string;
  endTime: string | null;
  lesson: TeacherLessonDto;
}

export interface TeacherSessionDto {
  code: string;
  labelVi: string;
  periods: TeacherPeriodDto[];
}

export interface TeacherDayDto {
  date: string;
  dayLabelVi: string;
  isToday: boolean;
  /** Lessons this teacher actually teaches (substitution-aware, engine-computed). */
  lessonCount: number;
  sessions: TeacherSessionDto[];
}

export interface TeacherTimetableView {
  teacher: TeacherInfoDto;
  /** null when no PUBLISHED version exists for the active week. */
  week: TeacherWeekDto | null;
  days: TeacherDayDto[];
}

export interface WorkloadDayCountDto {
  date: string;
  dayLabelVi: string;
  count: number;
}

export interface WorkloadClassCountDto {
  classCode: string;
  lessons: number;
}

export interface WorkloadSubjectCountDto {
  subjectName: string;
  componentName: string | null;
  lessons: number;
}

export interface TeacherWorkloadView {
  /** null when no PUBLISHED version exists for the active week. */
  week: TeacherWeekDto | null;
  expectedTeaching: number;
  dutyLessons: number;
  scheduled: number;
  difference: number;
  dayCounts: WorkloadDayCountDto[];
  classesTaught: WorkloadClassCountDto[];
  subjectsTaught: WorkloadSubjectCountDto[];
}

// ---------------------------------------------------------------------------
// Week DTO mapping (resolution lives in school-calendar.service)
// ---------------------------------------------------------------------------

function toWeekDto(context: PublishedWeekContext): TeacherWeekDto {
  return {
    weekNo: context.week.weekNo,
    weekStart: context.week.weekStart,
    weekEnd: context.week.weekEnd,
    schoolYearName: context.year.name,
    schoolName: context.year.schoolName,
  };
}

async function loadTeacherInfo(teacherId: string) {
  return prisma.teacher.findUnique({
    where: { id: teacherId },
    select: {
      code: true,
      fullName: true,
      position: true,
      department: { select: { name: true } },
    },
  });
}

// Matches WorkloadEntryInput so rows feed the domain engine without mapping.
interface TeacherEntryRow {
  id: string;
  teacherId: string;
  academicDayId: string;
  periodId: string;
  status: string;
  subject: { name: string };
  subjectComponent: { name: string } | null;
  class: { code: string };
  period: {
    orderNo: number;
    startTime: string;
    endTime: string | null;
    session: { code: string; labelVi: string; orderNo: number };
  };
  academicDay: { date: Date; dayOfWeek: number };
  substitution: { status: string; originalTeacher: { fullName: string } } | null;
}

/**
 * The teacher's week: own entries plus lessons they CONFIRMED-substitute for
 * (a substituted lesson belongs to the original teacher in the data, but it
 * is real work for the substitute — it must appear in their schedule and
 * count in their workload via the domain engine).
 */
async function loadTeacherEntries(
  versionId: string,
  teacherId: string,
): Promise<TeacherEntryRow[]> {
  return prisma.timetableEntry.findMany({
    where: {
      versionId,
      OR: [
        { teacherId },
        { substitution: { substituteTeacherId: teacherId, status: "CONFIRMED" } },
      ],
    },
    include: {
      subject: { select: { name: true } },
      subjectComponent: { select: { name: true } },
      class: { select: { code: true } },
      period: {
        select: {
          orderNo: true,
          startTime: true,
          endTime: true,
          session: { select: { code: true, labelVi: true, orderNo: true } },
        },
      },
      academicDay: { select: { date: true, dayOfWeek: true } },
      substitution: {
        select: { status: true, originalTeacher: { select: { fullName: true } } },
      },
    },
    orderBy: [
      { academicDay: { date: "asc" } },
      { period: { session: { orderNo: "asc" } } },
      { period: { orderNo: "asc" } },
    ],
  });
}

async function loadEntrySubstitutions(
  entryIds: string[],
): Promise<WorkloadSubstitutionInput[]> {
  if (entryIds.length === 0) return [];
  return prisma.substitution.findMany({
    where: { entryId: { in: entryIds }, status: { in: ["PENDING", "CONFIRMED"] } },
    select: {
      entryId: true,
      originalTeacherId: true,
      substituteTeacherId: true,
      status: true,
    },
  });
}

/**
 * Lessons of `entries` that count as scheduled for this teacher, per the
 * domain engine (NORMAL/MOVED/MAKEUP own entries; SUBSTITUTED/CANCELLED do
 * not count for the original teacher). Reusing the engine keeps day/class/
 * subject breakdowns exactly consistent with the headline `scheduled` number.
 */
function scheduledCountFor(
  entries: TeacherEntryRow[],
  substitutions: WorkloadSubstitutionInput[],
  teacherId: string,
): number {
  return (
    computeTeacherWorkloads([], entries, substitutions, [teacherId]).get(
      teacherId,
    )?.scheduled ?? 0
  );
}

/** School name for the top bar of the teacher area. */
export async function getActiveSchoolName(): Promise<string | null> {
  const year = await findActiveSchoolYear();
  return year?.schoolName ?? null;
}

// ---------------------------------------------------------------------------
// getTeacherTimetable
// ---------------------------------------------------------------------------

export async function getTeacherTimetable(
  teacherId: string,
): Promise<TeacherTimetableView | null> {
  const teacher = await loadTeacherInfo(teacherId);
  if (!teacher) return null;

  const context = await resolvePublishedContext();
  const teacherDto: TeacherInfoDto = {
    code: teacher.code,
    fullName: teacher.fullName,
    position: teacher.position,
    departmentName: teacher.department?.name ?? null,
  };
  if (!context) {
    return { teacher: teacherDto, week: null, days: [] };
  }

  const today = todayIso();
  const entries = await loadTeacherEntries(context.versionId, teacherId);
  const substitutions = await loadEntrySubstitutions(
    entries.map((entry) => entry.id),
  );

  const sessionOrderByCode = new Map<string, number>();
  for (const entry of entries) {
    sessionOrderByCode.set(
      entry.period.session.code,
      entry.period.session.orderNo,
    );
  }

  const entriesByDate = new Map<string, TeacherEntryRow[]>();
  for (const entry of entries) {
    const date = dateToIso(entry.academicDay.date);
    const list = entriesByDate.get(date);
    if (list) list.push(entry);
    else entriesByDate.set(date, [entry]);
  }

  // CANCELLED and SUBSTITUTED entries stay visible (teacher must know), so
  // every period below has a lesson; days/sessions/periods keep DB order.
  const days: TeacherDayDto[] = [...entriesByDate.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, dayEntries]) => {
      const sessionsByCode = new Map<string, TeacherSessionDto>();
      for (const entry of dayEntries) {
        const session = entry.period.session;
        let sessionDto = sessionsByCode.get(session.code);
        if (!sessionDto) {
          sessionDto = { code: session.code, labelVi: session.labelVi, periods: [] };
          sessionsByCode.set(session.code, sessionDto);
        }
        sessionDto.periods.push({
          orderNo: entry.period.orderNo,
          startTime: entry.period.startTime,
          endTime: entry.period.endTime,
          lesson: {
            className: entry.class.code,
            subjectName: entry.subject.name,
            componentName: entry.subjectComponent?.name ?? null,
            status: entry.status,
            substitutingFor:
              entry.teacherId !== teacherId && entry.substitution
                ? entry.substitution.originalTeacher.fullName
                : null,
          },
        });
      }
      return {
        date,
        dayLabelVi: dayLabelVi(dayEntries[0].academicDay.dayOfWeek, date),
        isToday: date === today,
        lessonCount: scheduledCountFor(dayEntries, substitutions, teacherId),
        sessions: [...sessionsByCode.values()].sort(
          (a, b) =>
            (sessionOrderByCode.get(a.code) ?? 0) -
            (sessionOrderByCode.get(b.code) ?? 0),
        ),
      };
    });

  return {
    teacher: teacherDto,
    week: toWeekDto(context),
    days,
  };
}

// ---------------------------------------------------------------------------
// getTeacherWorkload
// ---------------------------------------------------------------------------

export async function getTeacherWorkload(
  teacherId: string,
): Promise<TeacherWorkloadView | null> {
  const teacher = await loadTeacherInfo(teacherId);
  if (!teacher) return null;

  const year = await findActiveSchoolYear();
  if (!year) return null;

  const assignments: WorkloadAssignmentInput[] = await prisma.teachingAssignment.findMany(
    {
      where: { schoolYearId: year.id, teacherId },
      select: {
        teacherId: true,
        classId: true,
        subjectId: true,
        subjectComponentId: true,
        lessonsPerWeek: true,
        assignmentType: true,
      },
    },
  );

  const context = await resolvePublishedContext();
  const entries = context
    ? await loadTeacherEntries(context.versionId, teacherId)
    : [];
  const substitutions = await loadEntrySubstitutions(
    entries.map((entry) => entry.id),
  );

  const workload =
    computeTeacherWorkloads(assignments, entries, substitutions, [
      teacherId,
    ]).get(teacherId) ?? {
      teacherId,
      expectedTeaching: 0,
      dutyLessons: 0,
      scheduled: 0,
      difference: 0,
    };

  const dayCounts: WorkloadDayCountDto[] = [];
  const entriesByDate = new Map<string, TeacherEntryRow[]>();
  for (const entry of entries) {
    const date = dateToIso(entry.academicDay.date);
    const list = entriesByDate.get(date);
    if (list) list.push(entry);
    else entriesByDate.set(date, [entry]);
  }
  for (const [date, dayEntries] of [...entriesByDate.entries()].sort(
    ([dateA], [dateB]) => dateA.localeCompare(dateB),
  )) {
    dayCounts.push({
      date,
      dayLabelVi: dayLabelVi(dayEntries[0].academicDay.dayOfWeek, date),
      count: scheduledCountFor(dayEntries, substitutions, teacherId),
    });
  }

  const entriesByClass = new Map<string, TeacherEntryRow[]>();
  for (const entry of entries) {
    const list = entriesByClass.get(entry.class.code);
    if (list) list.push(entry);
    else entriesByClass.set(entry.class.code, [entry]);
  }
  const classesTaught: WorkloadClassCountDto[] = [...entriesByClass.entries()]
    .map(([classCode, classEntries]) => ({
      classCode,
      lessons: scheduledCountFor(classEntries, substitutions, teacherId),
    }))
    .sort(
      (a, b) => b.lessons - a.lessons || a.classCode.localeCompare(b.classCode),
    );

  interface SubjectGroup {
    subjectName: string;
    componentName: string | null;
    entries: TeacherEntryRow[];
  }
  const entriesBySubject = new Map<string, SubjectGroup>();
  for (const entry of entries) {
    const key = `${entry.subject.name}#${entry.subjectComponent?.name ?? ""}`;
    let group = entriesBySubject.get(key);
    if (!group) {
      group = {
        subjectName: entry.subject.name,
        componentName: entry.subjectComponent?.name ?? null,
        entries: [],
      };
      entriesBySubject.set(key, group);
    }
    group.entries.push(entry);
  }
  const subjectsTaught: WorkloadSubjectCountDto[] = [...entriesBySubject.values()]
    .map((group) => ({
      subjectName: group.subjectName,
      componentName: group.componentName,
      lessons: scheduledCountFor(group.entries, substitutions, teacherId),
    }))
    .sort(
      (a, b) =>
        b.lessons - a.lessons ||
        `${a.subjectName}${a.componentName ?? ""}`.localeCompare(
          `${b.subjectName}${b.componentName ?? ""}`,
        ),
    );

  return {
    week: context ? toWeekDto(context) : null,
    expectedTeaching: workload.expectedTeaching,
    dutyLessons: workload.dutyLessons,
    scheduled: workload.scheduled,
    difference: workload.difference,
    dayCounts,
    classesTaught,
    subjectsTaught,
  };
}

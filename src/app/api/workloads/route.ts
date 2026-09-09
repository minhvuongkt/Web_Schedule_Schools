import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { errorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/api/timetable-api";
import { assertPermission, AuthorizationError, type Role } from "@/server/domain/roles";
import { computeTeacherWorkloads, type WorkloadAssignmentInput } from "@/server/domain/workload";

/**
 * GET /api/workloads?weekId= — per-teacher expected/scheduled/difference for
 * a week's published version (leadership + workload:read-all only).
 */

const ISO = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    assertPermission(auth.user.role as Role, "workload:read-all");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(403, "FORBIDDEN", error.message, {
        permission: error.permission,
        role: error.role,
      });
    }
    throw error;
  }

  const url = new URL(request.url);
  let weekId = url.searchParams.get("weekId");
  let week = weekId
    ? await prisma.week.findUnique({
        where: { id: weekId },
        select: { id: true, weekNo: true, startDate: true, endDate: true },
      })
    : null;

  if (!week) {
    // default: active week (today), else latest week with a published version
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
    const todayBound = new Date(`${today}T00:00:00.000Z`);
    week =
      (await prisma.week.findFirst({
        where: {
          semester: { schoolYear: { status: "ACTIVE" } },
          startDate: { lte: todayBound },
          endDate: { gte: todayBound },
        },
        select: { id: true, weekNo: true, startDate: true, endDate: true },
        orderBy: { weekNo: "desc" },
      })) ??
      (await prisma.week.findFirst({
        where: { semester: { schoolYear: { status: "ACTIVE" } }, versions: { some: { status: "PUBLISHED" } } },
        select: { id: true, weekNo: true, startDate: true, endDate: true },
        orderBy: { weekNo: "desc" },
      }));
    if (!week) {
      return errorResponse(404, "WEEK_NOT_FOUND", "Không tìm thấy tuần học.");
    }
    weekId = week.id;
  }

  const version = await prisma.timetableVersion.findFirst({
    where: { weekId: week.id, status: "PUBLISHED" },
    orderBy: { versionNo: "desc" },
    select: { id: true },
  });
  if (!version) {
    return NextResponse.json({
      week: { weekNo: week.weekNo, weekStart: ISO(week.startDate), weekEnd: ISO(week.endDate) },
      workloads: [],
      note: "Chưa có phiên bản công bố cho tuần này.",
    });
  }

  const schoolYear = await prisma.schoolYear.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const [assignments, entries, substitutions, teachers, policies] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: { schoolYearId: schoolYear?.id, isActive: true },
      select: {
        teacherId: true,
        classId: true,
        subjectId: true,
        subjectComponentId: true,
        lessonsPerWeek: true,
        assignmentType: true,
      },
    }),
    prisma.timetableEntry.findMany({
      where: { versionId: version.id },
      select: { id: true, teacherId: true, academicDayId: true, periodId: true, status: true },
    }),
    prisma.substitution.findMany({
      where: { entry: { versionId: version.id } },
      select: { entryId: true, originalTeacherId: true, substituteTeacherId: true, status: true },
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      select: { id: true, code: true, fullName: true, position: true },
      orderBy: { code: "asc" },
    }),
    prisma.workloadPolicy.findMany({
      where: { schoolYearId: schoolYear?.id },
      select: { position: true, weeklyQuota: true },
    }),
  ]);

  const quotaByPosition = new Map(policies.map((p) => [p.position, p.weeklyQuota]));
  const workloadAssignments: WorkloadAssignmentInput[] = assignments.map((a) => ({
    teacherId: a.teacherId,
    classId: a.classId,
    subjectId: a.subjectId,
    subjectComponentId: a.subjectComponentId,
    lessonsPerWeek: a.lessonsPerWeek,
    assignmentType: a.assignmentType,
  }));
  const workloads = computeTeacherWorkloads(workloadAssignments, entries, substitutions, teachers.map((t) => t.id));

  return NextResponse.json({
    week: { weekNo: week.weekNo, weekStart: ISO(week.startDate), weekEnd: ISO(week.endDate) },
    workloads: teachers.map((t) => {
      const w = workloads.get(t.id)!;
      return {
        teacherId: t.id,
        teacherCode: t.code,
        fullName: t.fullName,
        position: t.position,
        expectedTeaching: w.expectedTeaching,
        dutyLessons: w.dutyLessons,
        scheduled: w.scheduled,
        difference: w.difference,
        quota: t.position ? quotaByPosition.get(t.position) ?? null : null,
        status: w.difference > 0 ? "THỪA" : w.difference < 0 ? "THIẾU" : "OK",
      };
    }),
  });
}

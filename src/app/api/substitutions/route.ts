import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import { createSubstitution } from "@/server/services/live-ops.service";
import { prisma } from "@/server/db";

/**
 * POST /api/substitutions          {entryId, substituteTeacherId, reason?, autoConfirm?}
 * POST /api/substitutions/confirm  {substitutionId}
 * POST /api/substitutions/cancel   {substitutionId}
 * GET  /api/substitutions?weekId=  — active substitutions of a week's published version
 * POST /api/substitutions/cancel-lesson  {entryId, reason?}  — live lesson cancellation
 * POST /api/substitutions/makeup   {originalEntryId, academicDayId, periodId, reason?}
 * POST /api/substitutions/makeup-cancel {makeupLessonId}
 */

const createSchema = z.object({
  entryId: z.string().min(1),
  substituteTeacherId: z.string().min(1),
  reason: z.string().max(500).nullish(),
  autoConfirm: z.boolean().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    const result = await createSubstitution(
      {
        entryId: parsed.data.entryId,
        substituteTeacherId: parsed.data.substituteTeacherId,
        reason: parsed.data.reason ?? null,
        autoConfirm: parsed.data.autoConfirm,
      },
      auth.user,
    );
    return NextResponse.json(result);
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const weekId = url.searchParams.get("weekId");

  const version = await (async () => {
    if (weekId) {
      return prisma.timetableVersion.findFirst({
        where: { weekId, status: "PUBLISHED" },
        orderBy: { versionNo: "desc" },
        select: { id: true },
      });
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    const bound = new Date(`${today}T00:00:00.000Z`);
    const week =
      (await prisma.week.findFirst({
        where: { semester: { schoolYear: { status: "ACTIVE" } }, startDate: { lte: bound }, endDate: { gte: bound } },
        select: { id: true },
      })) ??
      (await prisma.week.findFirst({
        where: { semester: { schoolYear: { status: "ACTIVE" } }, versions: { some: { status: "PUBLISHED" } } },
        orderBy: { weekNo: "desc" },
        select: { id: true },
      }));
    if (!week) return null;
    return prisma.timetableVersion.findFirst({
      where: { weekId: week.id, status: "PUBLISHED" },
      orderBy: { versionNo: "desc" },
      select: { id: true },
    });
  })();
  if (!version) {
    return NextResponse.json({ substitutions: [], makeups: [] });
  }

  const [substitutions, makeups] = await Promise.all([
    prisma.substitution.findMany({
      where: { entry: { versionId: version.id }, status: { not: "CANCELLED" } },
      select: {
        id: true,
        status: true,
        reason: true,
        originalTeacher: { select: { fullName: true } },
        substituteTeacher: { select: { fullName: true } },
        entry: {
          select: {
            id: true,
            status: true,
            subject: { select: { name: true } },
            subjectComponent: { select: { name: true } },
            class: { select: { code: true } },
            academicDay: { select: { date: true, dayOfWeek: true } },
            period: { select: { orderNo: true, startTime: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.makeupLesson.findMany({
      where: { originalEntry: { versionId: version.id }, status: { not: "CANCELLED" } },
      select: {
        id: true,
        status: true,
        reason: true,
        originalEntry: {
          select: {
            id: true,
            subject: { select: { name: true } },
            subjectComponent: { select: { name: true } },
            class: { select: { code: true } },
          },
        },
        makeupEntry: {
          select: {
            id: true,
            academicDay: { select: { date: true, dayOfWeek: true } },
            period: { select: { orderNo: true, startTime: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    substitutions: substitutions.map((s) => ({
      id: s.id,
      status: s.status,
      reason: s.reason,
      originalTeacherName: s.originalTeacher.fullName,
      substituteTeacherName: s.substituteTeacher.fullName,
      entry: {
        id: s.entry.id,
        status: s.entry.status,
        subjectName: s.entry.subject.name,
        componentName: s.entry.subjectComponent?.name ?? null,
        classCode: s.entry.class.code,
        dayOfWeek: s.entry.academicDay.dayOfWeek,
        date: s.entry.academicDay.date.toISOString().slice(0, 10),
        periodOrderNo: s.entry.period.orderNo,
        startTime: s.entry.period.startTime,
      },
    })),
    makeups: makeups.map((m) => ({
      id: m.id,
      status: m.status,
      reason: m.reason,
      original: {
        id: m.originalEntry.id,
        subjectName: m.originalEntry.subject.name,
        componentName: m.originalEntry.subjectComponent?.name ?? null,
        classCode: m.originalEntry.class.code,
      },
      makeup: m.makeupEntry
        ? {
            id: m.makeupEntry.id,
            dayOfWeek: m.makeupEntry.academicDay.dayOfWeek,
            date: m.makeupEntry.academicDay.date.toISOString().slice(0, 10),
            periodOrderNo: m.makeupEntry.period.orderNo,
            startTime: m.makeupEntry.period.startTime,
          }
        : null,
    })),
  });
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

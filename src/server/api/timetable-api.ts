import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { getCurrentUser, type SessionUser } from "@/server/auth/session";
import {
  createEntry,
  createVersion,
  deleteEntry,
  deleteVersion,
  transitionVersion,
  updateEntry,
  validateVersion,
  MutationError,
} from "@/server/services/timetable-write.service";
import { AuthorizationError } from "@/server/domain/roles";
import { prisma } from "@/server/db";

/**
 * Planner API (contract implemented for the FE agents):
 *   GET    /api/weeks
 *   POST   /api/timetable/versions            {weekId, copyFromVersionId?}
 *   GET    /api/timetable/versions?weekId=
 *   GET    /api/timetable/versions/:id        (full grid data)
 *   POST   /api/timetable/versions/:id/validate
 *   POST   /api/timetable/versions/:id/submit-review|approve|publish
 *   DELETE /api/timetable/versions/:id        (DRAFT only)
 *   POST   /api/timetable/entries
 *   PATCH  /api/timetable/entries/:id
 *   DELETE /api/timetable/entries/:id
 */

export function mutationErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof MutationError) {
    return errorResponse(error.status, error.code, error.message, error.details);
  }
  if (error instanceof AuthorizationError) {
    return errorResponse(403, "FORBIDDEN", error.message, {
      permission: error.permission,
      role: error.role,
    });
  }
  return null;
}

type ApiAuth =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export async function requireApiUser(): Promise<ApiAuth> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: errorResponse(401, "UNAUTHENTICATED", "Bạn cần đăng nhập.") };
  }
  return { ok: true, user };
}

// --- GET /api/weeks ------------------------------------------------------
const weeksResponse = () =>
  prisma.week.findMany({
    where: { semester: { schoolYear: { status: "ACTIVE" } } },
    select: {
      id: true,
      weekNo: true,
      startDate: true,
      endDate: true,
      status: true,
      versions: { where: { status: "PUBLISHED" }, select: { id: true } },
    },
    orderBy: { weekNo: "asc" },
  });

export type WeeksPayload = {
  weeks: {
    id: string;
    weekNo: number;
    weekStart: string;
    weekEnd: string;
    status: string;
    hasPublished: boolean;
  }[];
};

export async function listWeeks(): Promise<WeeksPayload> {
  const rows = await weeksResponse();
  return {
    weeks: rows.map((w) => ({
      id: w.id,
      weekNo: w.weekNo,
      weekStart: w.startDate.toISOString().slice(0, 10),
      weekEnd: w.endDate.toISOString().slice(0, 10),
      status: w.status,
      hasPublished: w.versions.length > 0,
    })),
  };
}

// --- version payload builders --------------------------------------------

const ISO = (d: Date) => d.toISOString().slice(0, 10);

export async function listVersions(weekId: string) {
  const versions = await prisma.timetableVersion.findMany({
    where: { weekId },
    select: {
      id: true,
      weekId: true,
      versionNo: true,
      status: true,
      revision: true,
      name: true,
      createdAt: true,
      submittedAt: true,
      approvedAt: true,
      publishedAt: true,
      _count: { select: { entries: true } },
    },
    orderBy: { versionNo: "desc" },
  });
  return {
    versions: versions.map((v) => ({
      id: v.id,
      weekId: v.weekId,
      versionNo: v.versionNo,
      status: v.status,
      revision: v.revision,
      name: v.name,
      createdAt: v.createdAt.toISOString(),
      submittedAt: v.submittedAt?.toISOString() ?? null,
      approvedAt: v.approvedAt?.toISOString() ?? null,
      publishedAt: v.publishedAt?.toISOString() ?? null,
      entryCount: v._count.entries,
    })),
  };
}

export async function getVersionGrid(versionId: string) {
  const version = await prisma.timetableVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      weekId: true,
      versionNo: true,
      status: true,
      revision: true,
      week: { select: { id: true, weekNo: true } },
    },
  });
  if (!version) return null;
  const [days, sessions, periods, entries] = await Promise.all([
    prisma.academicDay.findMany({
      where: { weekId: version.weekId },
      select: { id: true, date: true, dayOfWeek: true, isSchoolDay: true },
      orderBy: { date: "asc" },
    }),
    prisma.sessionConfig.findMany({
      where: { schoolYear: { status: "ACTIVE" } },
      select: { id: true, code: true, labelVi: true, orderNo: true },
      orderBy: { orderNo: "asc" },
    }),
    prisma.period.findMany({
      where: { session: { schoolYear: { status: "ACTIVE" } } },
      select: { id: true, sessionId: true, orderNo: true, startTime: true, endTime: true },
      orderBy: [{ session: { orderNo: "asc" } }, { orderNo: "asc" }],
    }),
    prisma.timetableEntry.findMany({
      where: { versionId: version.id },
      select: {
        id: true,
        academicDayId: true,
        periodId: true,
        classId: true,
        subjectId: true,
        subjectComponentId: true,
        teacherId: true,
        roomId: true,
        status: true,
        notes: true,
      },
    }),
  ]);
  return {
    version: {
      id: version.id,
      weekId: version.weekId,
      weekNo: version.week.weekNo,
      versionNo: version.versionNo,
      status: version.status,
      revision: version.revision,
    },
    days: days.map((d) => ({
      id: d.id,
      date: ISO(d.date),
      dayOfWeek: d.dayOfWeek,
      isSchoolDay: d.isSchoolDay,
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      code: s.code,
      labelVi: s.labelVi,
      orderNo: s.orderNo,
    })),
    periods: periods.map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      orderNo: p.orderNo,
      startTime: p.startTime,
      endTime: p.endTime,
    })),
    entries,
  };
}

// --- shared route handlers ------------------------------------------------

export async function handleListWeeks(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await listWeeks());
}

const createVersionSchema = z.object({
  weekId: z.string().min(1),
  copyFromVersionId: z.string().min(1).optional(),
});

export async function handleCreateVersion(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = createVersionSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    const result = await createVersion(
      parsed.data.weekId,
      auth.user,
      parsed.data.copyFromVersionId,
    );
    return NextResponse.json({ version: { id: result.versionId, ...result } });
  } catch (error) {
    return mutationErrorResponse(error) ?? throwInternal(error);
  }
}

export async function handleListVersions(weekId: string | null): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!weekId) {
    return errorResponse(400, "VALIDATION_ERROR", "Thiếu tham số weekId.");
  }
  return NextResponse.json(await listVersions(weekId));
}

export async function handleGetVersionGrid(id: string): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const grid = await getVersionGrid(id);
  if (!grid) {
    return errorResponse(404, "VERSION_NOT_FOUND", "Không tìm thấy phiên bản thời khóa biểu.");
  }
  return NextResponse.json(grid);
}

/** DELETE /api/timetable/versions/:id — DRAFT-only, timetable:write. */
export async function handleDeleteVersion(id: string): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    const result = await deleteVersion(id, auth.user);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return mutationErrorResponse(error) ?? throwInternal(error);
  }
}

export async function handleValidateVersion(id: string): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    const report = await validateVersion(id);
    return NextResponse.json(report);
  } catch (error) {
    return mutationErrorResponse(error) ?? throwInternal(error);
  }
}

export async function handleTransition(
  id: string,
  target: "REVIEW" | "APPROVED" | "PUBLISHED",
): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    const result = await transitionVersion(id, target, auth.user);
    const version = await prisma.timetableVersion.findUnique({
      where: { id },
      select: { id: true, weekId: true, versionNo: true, status: true, revision: true },
    });
    return NextResponse.json({ version, ...result });
  } catch (error) {
    return mutationErrorResponse(error) ?? throwInternal(error);
  }
}

const entrySchema = z.object({
  versionId: z.string().min(1),
  academicDayId: z.string().min(1),
  periodId: z.string().min(1),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  subjectComponentId: z.string().nullable().optional(),
  teacherId: z.string().min(1),
  roomId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  expectedRevision: z.number().int().nonnegative(),
});

export async function handleCreateEntry(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    const { entryId, revision } = await createEntry(parsed.data, auth.user);
    const entry = await prisma.timetableEntry.findUnique({ where: { id: entryId } });
    return NextResponse.json({ entry, revision });
  } catch (error) {
    return mutationErrorResponse(error) ?? throwInternal(error);
  }
}

const patchSchema = z.object({
  academicDayId: z.string().min(1).optional(),
  periodId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  subjectComponentId: z.string().nullable().optional(),
  teacherId: z.string().min(1).optional(),
  roomId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  expectedRevision: z.number().int().nonnegative(),
});

export async function handleUpdateEntry(id: string, request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  const { expectedRevision, ...patch } = parsed.data;
  try {
    const { entryId, revision } = await updateEntry({ entryId: id, patch, expectedRevision }, auth.user);
    const entry = await prisma.timetableEntry.findUnique({ where: { id: entryId } });
    return NextResponse.json({ entry, revision });
  } catch (error) {
    return mutationErrorResponse(error) ?? throwInternal(error);
  }
}

export async function handleDeleteEntry(id: string, request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const revision = Number(url.searchParams.get("expectedRevision"));
  if (!Number.isInteger(revision) || revision < 0) {
    return errorResponse(400, "VALIDATION_ERROR", "Thiếu expectedRevision.");
  }
  try {
    const { revision: newRevision } = await deleteEntry(id, revision, auth.user);
    return NextResponse.json({ ok: true, revision: newRevision });
  } catch (error) {
    return mutationErrorResponse(error) ?? throwInternal(error);
  }
}

type Params = { params: Promise<{ id: string }> };
export type { Params };

function throwInternal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

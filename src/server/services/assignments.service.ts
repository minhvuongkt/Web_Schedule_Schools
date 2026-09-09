import { prisma } from "@/server/db";
import { assertPermission, type Role } from "@/server/domain/roles";
import type { SessionUser } from "@/server/services/auth.service";
import { MutationError } from "@/server/services/timetable-write.service";

/**
 * TeachingAssignment management (expected workload: who should teach what,
 * to which class, how many lessons per week — never merged with actual
 * TimetableEntry schedules; see docs/timetable-rules.md §1).
 *
 * Deletes are soft (isActive = false) so audit history and workload
 * comparisons stay meaningful across the year.
 */

function assertManage(user: SessionUser): void {
  assertPermission(user.role as Role, "assignments:manage");
}

function assertRead(user: SessionUser): void {
  assertPermission(user.role as Role, "workload:read-all");
}

const ASSIGNMENT_SELECT = {
  id: true,
  teacherId: true,
  classId: true,
  subjectId: true,
  subjectComponentId: true,
  lessonsPerWeek: true,
  assignmentType: true,
  notes: true,
  isActive: true,
  sourceRaw: true,
  teacher: { select: { code: true, fullName: true } },
  class: { select: { code: true } },
  subject: { select: { name: true } },
  subjectComponent: { select: { name: true } },
} as const;

async function activeSchoolYearId(): Promise<string> {
  const year = await prisma.schoolYear.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  if (!year) {
    throw new MutationError("NO_SCHOOL_YEAR", "Không tìm thấy năm học đang hoạt động.", {}, 400);
  }
  return year.id;
}

export async function listAssignments(
  user: SessionUser,
  filter: { teacherId?: string; includeInactive?: boolean } = {},
): Promise<unknown[]> {
  assertRead(user);
  const schoolYearId = await activeSchoolYearId();
  const rows = await prisma.teachingAssignment.findMany({
    where: {
      schoolYearId,
      ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
      ...(filter.includeInactive ? {} : { isActive: true }),
    },
    select: ASSIGNMENT_SELECT,
    orderBy: [{ teacher: { code: "asc" } }, { class: { code: "asc" } }],
  });
  return rows;
}

export interface AssignmentInput {
  teacherId: string;
  classId?: string | null;
  subjectId?: string | null;
  subjectComponentId?: string | null;
  lessonsPerWeek: number;
  assignmentType?: string;
  notes?: string | null;
}

async function validateReferences(input: AssignmentInput): Promise<void> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: input.teacherId },
    select: { id: true, isActive: true },
  });
  if (!teacher || !teacher.isActive) {
    throw new MutationError("TEACHER_NOT_FOUND", "Không tìm thấy giáo viên.", { teacherId: input.teacherId }, 404);
  }
  if (input.classId) {
    const cls = await prisma.class.findUnique({ where: { id: input.classId }, select: { id: true } });
    if (!cls) throw new MutationError("CLASS_NOT_FOUND", "Không tìm thấy lớp.", { classId: input.classId }, 404);
  }
  if (input.subjectId) {
    const subject = await prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } });
    if (!subject) throw new MutationError("SUBJECT_NOT_FOUND", "Không tìm thấy môn học.", { subjectId: input.subjectId }, 404);
  }
  if (input.subjectComponentId) {
    const component = await prisma.subjectComponent.findUnique({
      where: { id: input.subjectComponentId },
      select: { id: true, subjectId: true },
    });
    if (!component || (input.subjectId && component.subjectId !== input.subjectId)) {
      throw new MutationError("COMPONENT_MISMATCH", "Phân môn không thuộc môn học đã chọn.", { subjectComponentId: input.subjectComponentId }, 400);
    }
  }
  if (input.assignmentType && !["TEACHING", "DUTY"].includes(input.assignmentType)) {
    throw new MutationError("VALIDATION_ERROR", "Loại phân công không hợp lệ (TEACHING hoặc DUTY).", { assignmentType: input.assignmentType }, 400);
  }
}

export async function createAssignment(
  input: AssignmentInput,
  actor: SessionUser,
): Promise<{ assignmentId: string }> {
  assertManage(actor);
  await validateReferences(input);
  const schoolYearId = await activeSchoolYearId();

  return prisma.$transaction(async (t) => {
    const assignment = await t.teachingAssignment.create({
      data: {
        schoolYearId,
        teacherId: input.teacherId,
        classId: input.classId ?? null,
        subjectId: input.subjectId ?? null,
        subjectComponentId: input.subjectComponentId ?? null,
        lessonsPerWeek: input.lessonsPerWeek,
        assignmentType: input.assignmentType ?? "TEACHING",
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
    await t.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.displayName,
        action: "CREATE",
        entityType: "TeachingAssignment",
        entityId: assignment.id,
        after: { ...input },
      },
    });
    return { assignmentId: assignment.id };
  });
}

export async function updateAssignment(
  assignmentId: string,
  patch: Partial<AssignmentInput>,
  actor: SessionUser,
): Promise<{ assignmentId: string }> {
  assertManage(actor);
  const existing = await prisma.teachingAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, isActive: true, teacherId: true, classId: true, subjectId: true, subjectComponentId: true, lessonsPerWeek: true, assignmentType: true, notes: true, schoolYearId: true },
  });
  if (!existing || !existing.isActive) {
    throw new MutationError("ASSIGNMENT_NOT_FOUND", "Không tìm thấy phân công.", { assignmentId }, 404);
  }
  const merged: AssignmentInput = {
    teacherId: patch.teacherId ?? existing.teacherId,
    classId: patch.classId !== undefined ? patch.classId : existing.classId,
    subjectId: patch.subjectId !== undefined ? patch.subjectId : existing.subjectId,
    subjectComponentId:
      patch.subjectComponentId !== undefined ? patch.subjectComponentId : existing.subjectComponentId,
    lessonsPerWeek: patch.lessonsPerWeek ?? existing.lessonsPerWeek,
    assignmentType: patch.assignmentType ?? existing.assignmentType,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  };
  await validateReferences(merged);

  return prisma.$transaction(async (t) => {
    await t.teachingAssignment.update({
      where: { id: assignmentId },
      data: {
        teacherId: merged.teacherId,
        classId: merged.classId ?? null,
        subjectId: merged.subjectId ?? null,
        subjectComponentId: merged.subjectComponentId ?? null,
        lessonsPerWeek: merged.lessonsPerWeek,
        assignmentType: merged.assignmentType ?? "TEACHING",
        notes: merged.notes ?? null,
      },
    });
    await t.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.displayName,
        action: "UPDATE",
        entityType: "TeachingAssignment",
        entityId: assignmentId,
        before: { teacherId: existing.teacherId, classId: existing.classId, subjectId: existing.subjectId, lessonsPerWeek: existing.lessonsPerWeek },
        after: { ...merged },
      },
    });
    return { assignmentId };
  });
}

export async function deactivateAssignment(
  assignmentId: string,
  reason: string | null | undefined,
  actor: SessionUser,
): Promise<{ assignmentId: string }> {
  assertManage(actor);
  const existing = await prisma.teachingAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, isActive: true },
  });
  if (!existing || !existing.isActive) {
    throw new MutationError("ASSIGNMENT_NOT_FOUND", "Không tìm thấy phân công.", { assignmentId }, 404);
  }

  return prisma.$transaction(async (t) => {
    await t.teachingAssignment.update({
      where: { id: assignmentId },
      data: { isActive: false },
    });
    await t.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.displayName,
        action: "DELETE",
        entityType: "TeachingAssignment",
        entityId: assignmentId,
        before: { isActive: true },
        after: { isActive: false },
        reason: reason ?? undefined,
      },
    });
    return { assignmentId };
  });
}

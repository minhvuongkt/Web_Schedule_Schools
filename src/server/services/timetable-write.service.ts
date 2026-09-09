import { prisma } from "@/server/db";
import {
  validateEntries,
  type ConflictContext,
  type ConflictEntryInput,
  type ValidationResult,
} from "@/server/domain/conflict";
import { computeTeacherWorkloads } from "@/server/domain/workload";
import {
  assertPermission,
  type Permission,
  type Role,
} from "@/server/domain/roles";
import type { SessionUser } from "@/server/services/auth.service";
import { publishNotificationsChanged } from "@/server/services/notification-events";

/**
 * Timetable mutations (create/update/delete entries, version lifecycle).
 *
 * Invariants (docs/timetable-rules.md §2):
 * - Only DRAFT versions are editable; PUBLISHED_VERSION_MUTATION otherwise.
 * - Optimistic concurrency: every mutation carries expectedRevision; stale
 *   writes fail with VERSION_OUTDATED and never silently overwrite.
 * - Hard conflicts block the write (validated BEFORE the transaction with a
 *   hypothetical entry set; partial unique indexes are the race backstop).
 * - Every mutation writes an AuditLog row (before/after) and bumps revision.
 */

export type EntryField =
  | "academicDayId"
  | "periodId"
  | "classId"
  | "subjectId"
  | "subjectComponentId"
  | "teacherId"
  | "roomId"
  | "notes";

export interface EntryPatch {
  academicDayId?: string;
  periodId?: string;
  classId?: string;
  subjectId?: string;
  subjectComponentId?: string | null;
  teacherId?: string;
  roomId?: string | null;
  notes?: string | null;
}

export class MutationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "MutationError";
  }
}

// ---------------------------------------------------------------------------
// Context loading (shared by validation + services)
// ---------------------------------------------------------------------------

interface VersionMeta {
  id: string;
  weekId: string;
  status: string;
  revision: number;
  week: { weekNo: number };
}

async function loadVersionMeta(versionId: string): Promise<VersionMeta> {
  const version = await prisma.timetableVersion.findUnique({
    where: { id: versionId },
    select: { id: true, weekId: true, status: true, revision: true, week: { select: { weekNo: true } } },
  });
  if (!version) {
    throw new MutationError("VERSION_NOT_FOUND", "Không tìm thấy phiên bản thời khóa biểu.", { versionId }, 404);
  }
  return version;
}

async function loadConflictContext(
  schoolYearId: string,
): Promise<ConflictContext> {
  const [days, periods, classes, teachers, subjects, rooms, availability] =
    await Promise.all([
      prisma.academicDay.findMany({ select: { id: true, isSchoolDay: true, dayOfWeek: true } }),
      prisma.period.findMany({ select: { id: true, sessionId: true, orderNo: true } }),
      prisma.class.findMany({ where: { schoolYearId }, select: { id: true, code: true } }),
      prisma.teacher.findMany({ select: { id: true, code: true, fullName: true } }),
      prisma.subject.findMany({ select: { id: true, code: true } }),
      prisma.room.findMany({ select: { id: true, code: true, capacity: true } }),
      prisma.teacherAvailability.findMany({
        where: { schoolYearId },
        select: { teacherId: true, dayOfWeek: true, status: true },
      }),
    ]);

  const teacherAvailability = new Map<string, Map<number, "AVAILABLE" | "UNAVAILABLE" | "PREFERRED">>();
  for (const row of availability) {
    let inner = teacherAvailability.get(row.teacherId);
    if (!inner) {
      inner = new Map();
      teacherAvailability.set(row.teacherId, inner);
    }
    inner.set(row.dayOfWeek, row.status as "AVAILABLE" | "UNAVAILABLE" | "PREFERRED");
  }

  return {
    days: new Map(
      days.map((d) => [d.id, { isSchoolDay: d.isSchoolDay, dayOfWeek: d.dayOfWeek }]),
    ),
    periods: new Map(periods.map((p) => [p.id, { sessionId: p.sessionId, orderNo: p.orderNo }])),
    classes: new Map(classes.map((c) => [c.id, { code: c.code, studentCount: null }])),
    teachers: new Map(teachers.map((t) => [t.id, { code: t.code, fullName: t.fullName }])),
    subjects: new Map(subjects.map((s) => [s.id, { code: s.code }])),
    rooms: new Map(rooms.map((r) => [r.id, { code: r.code, capacity: r.capacity }])),
    teacherAvailability,
  };
}

async function loadSchoolYearIdForVersion(versionId: string): Promise<string> {
  const week = await prisma.week.findFirst({
    where: { versions: { some: { id: versionId } } },
    select: { schoolYearId: true, semester: { select: { schoolYearId: true } } },
  });
  const schoolYearId = week?.schoolYearId ?? week?.semester?.schoolYearId;
  if (!schoolYearId) {
    throw new MutationError("NO_SCHOOL_YEAR", "Không xác định được năm học của phiên bản.", { versionId }, 400);
  }
  return schoolYearId;
}

interface EntryRow {
  id: string;
  versionId: string;
  academicDayId: string;
  periodId: string;
  classId: string;
  teacherId: string;
  subjectId: string;
  subjectComponentId: string | null;
  roomId: string | null;
  status: string;
}

function toConflictInputs(rows: EntryRow[], versionStatus: string): ConflictEntryInput[] {
  return rows.map((row) => ({
    id: row.id,
    versionId: row.versionId,
    versionStatus,
    academicDayId: row.academicDayId,
    periodId: row.periodId,
    classId: row.classId,
    teacherId: row.teacherId,
    subjectId: row.subjectId,
    subjectComponentId: row.subjectComponentId,
    roomId: row.roomId,
    status: row.status,
  }));
}

/**
 * Validates the full entry set of a version (or a hypothetical mutation of
 * it). Pure domain engine + loaded context — reused by entry mutations and
 * by POST /versions/:id/validate.
 */
export async function validateVersionEntries(
  versionId: string,
  overrides: {
    replaceEntryId?: string;
    patchedEntry?: ConflictEntryInput;
    additionalEntry?: ConflictEntryInput;
  } = {},
): Promise<ValidationResult> {
  await loadVersionMeta(versionId); // existence check (404 envelope upstream)
  const schoolYearId = await loadSchoolYearIdForVersion(versionId);
  const [ctx, rows] = await Promise.all([
    loadConflictContext(schoolYearId),
    prisma.timetableEntry.findMany({
      where: { versionId },
      select: ENTRY_SELECT,
    }),
  ]);
  let inputs: ConflictEntryInput[] = toConflictInputs(rows, "DRAFT");
  if (overrides.replaceEntryId && overrides.patchedEntry) {
    const patched = overrides.patchedEntry;
    inputs = inputs.map((input) =>
      input.id === overrides.replaceEntryId ? patched : input,
    );
  }
  if (overrides.additionalEntry) {
    inputs = [...inputs, overrides.additionalEntry];
  }
  // Slot/availability checks run with DRAFT semantics; the version's own
  // workflow state is validated by transition guards, not by the engine.
  return validateEntries(inputs, ctx, { editableStatuses: ["DRAFT", "REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"] });
}

const ENTRY_SELECT = {
  id: true,
  versionId: true,
  academicDayId: true,
  periodId: true,
  classId: true,
  teacherId: true,
  subjectId: true,
  subjectComponentId: true,
  roomId: true,
  status: true,
} as const;

// ---------------------------------------------------------------------------
// Entry mutations
// ---------------------------------------------------------------------------

function assertCanWrite(user: SessionUser): void {
  assertPermission(user.role as Role, "timetable:write" satisfies Permission);
}

async function beginVersionedMutation(
  versionId: string,
  expectedRevision: number,
): Promise<VersionMeta> {
  const version = await loadVersionMeta(versionId);
  if (version.status !== "DRAFT") {
    throw new MutationError(
      "PUBLISHED_VERSION_MUTATION",
      `Không thể sửa phiên bản ${version.status} — chỉ bản DRAFT được chỉnh sửa.`,
      { versionId, status: version.status },
      409,
    );
  }
  if (version.revision !== expectedRevision) {
    throw new MutationError(
      "VERSION_OUTDATED",
      "Phiên bản thời khóa biểu đã bị cập nhật bởi người khác. Vui lòng tải lại.",
      { versionId, expectedRevision, currentRevision: version.revision },
      409,
    );
  }
  return version;
}

async function auditAndBump(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  version: VersionMeta,
  actor: SessionUser,
  action: "CREATE" | "UPDATE" | "DELETE" | "MOVE",
  entityType: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
  reason?: string,
): Promise<number> {
  const updated = await tx.timetableVersion.update({
    where: { id: version.id },
    data: { revision: { increment: 1 } },
    select: { revision: true },
  });
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.displayName,
      action,
      entityType,
      entityId,
      before: before === null ? undefined : (before as object),
      after: after === null ? undefined : (after as object),
      reason,
    },
  });
  return updated.revision;
}

export interface CreateEntryInput {
  versionId: string;
  academicDayId: string;
  periodId: string;
  classId: string;
  subjectId: string;
  subjectComponentId?: string | null;
  teacherId: string;
  roomId?: string | null;
  notes?: string | null;
  expectedRevision: number;
}

export async function createEntry(
  input: CreateEntryInput,
  actor: SessionUser,
): Promise<{ entryId: string; revision: number }> {
  assertCanWrite(actor);
  const version = await beginVersionedMutation(input.versionId, input.expectedRevision);

  const hypothetical: ConflictEntryInput = {
    id: "hypothetical",
    versionId: input.versionId,
    versionStatus: "DRAFT",
    academicDayId: input.academicDayId,
    periodId: input.periodId,
    classId: input.classId,
    teacherId: input.teacherId,
    subjectId: input.subjectId,
    subjectComponentId: input.subjectComponentId ?? null,
    roomId: input.roomId ?? null,
    status: "NORMAL",
  };
  const result = await validateVersionEntries(input.versionId, {
    additionalEntry: hypothetical,
  });

  // Only hard errors that involve the hypothetical entry (or global ones like
  // INVALID_REFERENCE) block the create.
  const blocking = result.errors.filter((issue) => {
    if (issue.code === "PUBLISHED_VERSION_MUTATION") return false;
    const entryIds = issue.details.entryIds;
    if (Array.isArray(entryIds)) return entryIds.includes("hypothetical");
    if (issue.details.entryId !== undefined) return issue.details.entryId === "hypothetical";
    return true;
  });
  if (blocking.length > 0) {
    const first = blocking[0];
    throw new MutationError(first.code, first.message, first.details, 409);
  }

  return prisma.$transaction(async (tx) => {
    // Re-check revision inside the transaction (race backstop).
    const fresh = await tx.timetableVersion.findUnique({
      where: { id: version.id },
      select: { revision: true, status: true },
    });
    if (!fresh || fresh.revision !== version.revision || fresh.status !== "DRAFT") {
      throw new MutationError("VERSION_OUTDATED", "Phiên bản đã thay đổi. Vui lòng tải lại.", { versionId: version.id }, 409);
    }
    try {
      const entry = await tx.timetableEntry.create({
        data: {
          versionId: input.versionId,
          academicDayId: input.academicDayId,
          periodId: input.periodId,
          classId: input.classId,
          subjectId: input.subjectId,
          subjectComponentId: input.subjectComponentId ?? null,
          teacherId: input.teacherId,
          roomId: input.roomId ?? null,
          notes: input.notes ?? null,
          status: "NORMAL",
        },
        select: { id: true },
      });
      const revision = await auditAndBump(
        tx,
        version,
        actor,
        "CREATE",
        "TimetableEntry",
        entry.id,
        null,
        { ...input, notes: input.notes ?? null },
      );
      return { entryId: entry.id, revision };
    } catch (error) {
      throw mapUniqueViolation(error, "Tiết học bị trùng lịch tại cùng thời điểm.");
    }
  });
}

/** Maps Prisma P2002 partial-unique-index races onto MutationError. */
function mapUniqueViolation(error: unknown, message: string): unknown {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  ) {
    return new MutationError("SLOT_DOUBLE_BOOKED", message, undefined, 409);
  }
  return error;
}

export interface UpdateEntryInput {
  entryId: string;
  patch: EntryPatch;
  expectedRevision: number;
}

export async function updateEntry(
  input: UpdateEntryInput,
  actor: SessionUser,
): Promise<{ entryId: string; revision: number }> {
  assertCanWrite(actor);
  const existing = await prisma.timetableEntry.findUnique({
    where: { id: input.entryId },
    select: ENTRY_SELECT,
  });
  if (!existing) {
    throw new MutationError("ENTRY_NOT_FOUND", "Không tìm thấy tiết học.", { entryId: input.entryId }, 404);
  }
  const version = await beginVersionedMutation(existing.versionId, input.expectedRevision);

  const patched: ConflictEntryInput = {
    id: existing.id,
    versionId: existing.versionId,
    versionStatus: "DRAFT",
    academicDayId: input.patch.academicDayId ?? existing.academicDayId,
    periodId: input.patch.periodId ?? existing.periodId,
    classId: input.patch.classId ?? existing.classId,
    teacherId: input.patch.teacherId ?? existing.teacherId,
    subjectId: input.patch.subjectId ?? existing.subjectId,
    subjectComponentId:
      input.patch.subjectComponentId !== undefined
        ? input.patch.subjectComponentId
        : existing.subjectComponentId,
    roomId: input.patch.roomId !== undefined ? input.patch.roomId : existing.roomId,
    status: existing.status,
  };
  const result = await validateVersionEntries(existing.versionId, {
    replaceEntryId: existing.id,
    patchedEntry: patched,
  });
  const moved =
    (input.patch.academicDayId !== undefined && input.patch.academicDayId !== existing.academicDayId) ||
    (input.patch.periodId !== undefined && input.patch.periodId !== existing.periodId);
  const blocking = result.errors.filter((issue) => {
    if (issue.code === "PUBLISHED_VERSION_MUTATION") return false;
    const entryIds = issue.details.entryIds;
    if (Array.isArray(entryIds)) return entryIds.includes(existing.id);
    if (issue.details.entryId !== undefined) return issue.details.entryId === existing.id;
    // Reference/period issues carry a single entryId; global issues carry none
    // — both block a mutating write.
    return true;
  });
  if (blocking.length > 0) {
    const first = blocking[0];
    throw new MutationError(first.code, first.message, first.details, 409);
  }

  const { notes, subjectComponentId, roomId, ...rest } = input.patch;
  const data: Record<string, unknown> = { ...rest };
  if (subjectComponentId !== undefined) data.subjectComponentId = subjectComponentId;
  if (roomId !== undefined) data.roomId = roomId;
  if (notes !== undefined) data.notes = notes;

  return prisma.$transaction(async (tx) => {
    const fresh = await tx.timetableVersion.findUnique({
      where: { id: version.id },
      select: { revision: true, status: true },
    });
    if (!fresh || fresh.revision !== version.revision || fresh.status !== "DRAFT") {
      throw new MutationError("VERSION_OUTDATED", "Phiên bản đã thay đổi. Vui lòng tải lại.", { versionId: version.id }, 409);
    }
    try {
      await tx.timetableEntry.update({ where: { id: existing.id }, data });
    } catch (error) {
      throw mapUniqueViolation(error, "Tiết học bị trùng lịch tại cùng thời điểm.");
    }
    const revision = await auditAndBump(
      tx,
      version,
      actor,
      moved ? "MOVE" : "UPDATE",
      "TimetableEntry",
      existing.id,
      existing,
      { ...existing, ...patched },
    );
    return { entryId: existing.id, revision };
  });
}

export async function deleteEntry(
  entryId: string,
  expectedRevision: number,
  actor: SessionUser,
): Promise<{ revision: number }> {
  assertCanWrite(actor);
  const existing = await prisma.timetableEntry.findUnique({
    where: { id: entryId },
    select: ENTRY_SELECT,
  });
  if (!existing) {
    throw new MutationError("ENTRY_NOT_FOUND", "Không tìm thấy tiết học.", { entryId }, 404);
  }
  const version = await beginVersionedMutation(existing.versionId, expectedRevision);

  return prisma.$transaction(async (tx) => {
    const fresh = await tx.timetableVersion.findUnique({
      where: { id: version.id },
      select: { revision: true, status: true },
    });
    if (!fresh || fresh.revision !== version.revision || fresh.status !== "DRAFT") {
      throw new MutationError("VERSION_OUTDATED", "Phiên bản đã thay đổi. Vui lòng tải lại.", { versionId: version.id }, 409);
    }
    await tx.timetableEntry.delete({ where: { id: existing.id } });
    const revision = await auditAndBump(
      tx,
      version,
      actor,
      "DELETE",
      "TimetableEntry",
      existing.id,
      existing,
      null,
    );
    return { revision };
  });
}

// ---------------------------------------------------------------------------
// Version lifecycle
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<string, { action: string; next: string; permission: Permission }> = {
  "DRAFT→REVIEW": { action: "SUBMIT_REVIEW", next: "REVIEW", permission: "timetable:submit-review" },
  "REVIEW→APPROVED": { action: "APPROVE", next: "APPROVED", permission: "timetable:approve" },
  "APPROVED→PUBLISHED": { action: "PUBLISH", next: "PUBLISHED", permission: "timetable:publish" },
  "PUBLISHED→ARCHIVED": { action: "ROLLBACK", next: "ARCHIVED", permission: "timetable:publish" },
};

export async function transitionVersion(
  versionId: string,
  target: "REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED",
  actor: SessionUser,
): Promise<{ status: string; revision: number }> {
  const version = await loadVersionMeta(versionId);
  const key = `${version.status}→${target}`;
  const transition = TRANSITIONS[key];
  if (!transition) {
    throw new MutationError(
      "INVALID_TRANSITION",
      `Không thể chuyển phiên bản từ ${version.status} sang ${target}.`,
      { versionId, from: version.status, to: target },
      409,
    );
  }
  assertPermission(actor.role as Role, transition.permission);

  if (target === "PUBLISHED") {
    const result = await validateVersionEntries(versionId);
    const hardSlot = result.errors.filter((e) => e.code !== "PUBLISHED_VERSION_MUTATION");
    if (hardSlot.length > 0) {
      throw new MutationError(
        "HARD_CONFLICTS",
        `Không thể công bố: còn ${hardSlot.length} xung đột nặng.`,
        { counts: { errors: hardSlot.length }, issues: hardSlot.slice(0, 10) },
        409,
      );
    }
  }

  // Notification rows are written transactionally (notifyPublish uses tx);
  // the SSE push event fires only after the commit succeeds.
  const notifiedUserIds: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const stampField =
      transition.next === "REVIEW"
        ? { submittedBy: actor.id, submittedAt: new Date() }
        : transition.next === "APPROVED"
          ? { approvedBy: actor.id, approvedAt: new Date() }
          : transition.next === "PUBLISHED"
            ? { publishedBy: actor.id, publishedAt: new Date() }
            : {};
    if (transition.next === "PUBLISHED") {
      // Exactly one published version per week: archive the previous one.
      await tx.timetableVersion.updateMany({
        where: { weekId: version.weekId, status: "PUBLISHED", id: { not: version.id } },
        data: { status: "ARCHIVED" },
      });
    }
    const updated = await tx.timetableVersion.update({
      where: { id: version.id },
      data: { status: transition.next, revision: { increment: 1 }, ...stampField },
      select: { revision: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.displayName,
        action: transition.action,
        entityType: "TimetableVersion",
        entityId: version.id,
        before: { status: version.status },
        after: { status: transition.next },
      },
    });
    if (transition.next === "PUBLISHED") {
      await notifyPublish(tx, version.id, version.weekId, actor, notifiedUserIds);
    }
    return { status: transition.next, revision: updated.revision };
  });
  if (notifiedUserIds.length > 0) {
    publishNotificationsChanged(notifiedUserIds);
  }
  return result;
}

async function notifyPublish(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  versionId: string,
  weekId: string,
  actor: SessionUser,
  notifiedUserIds: string[],
): Promise<void> {
  const week = await tx.week.findUnique({
    where: { id: weekId },
    select: { weekNo: true },
  });
  const weekNo = week?.weekNo ?? 0;
  const title = `Đã công bố thời khóa biểu tuần ${String(weekNo).padStart(2, "0")}`;
  const body = `Thời khóa biểu tuần ${String(weekNo).padStart(2, "0")} đã được công bố bởi ${actor.displayName}.`;
  const teachers = await tx.teacher.findMany({
    where: { entries: { some: { versionId } }, isActive: true },
    select: { userId: true },
  });
  const recipients = teachers
    .map((t) => t.userId)
    .filter((id): id is string => id !== null);
  if (recipients.length === 0) return;
  const idempotencyKey = `publish:${versionId}`;
  const existing = await tx.notification.findUnique({ where: { idempotencyKey } });
  if (existing) return;
  const notification = await tx.notification.create({
    data: {
      type: "TIMETABLE_PUBLISHED",
      title,
      body,
      idempotencyKey,
      payload: { versionId, weekId, weekNo },
    },
  });
  await tx.notificationRecipient.createMany({
    data: recipients.map((userId) => ({ notificationId: notification.id, userId })),
    skipDuplicates: true,
  });
  notifiedUserIds.push(...recipients);
}

// ---------------------------------------------------------------------------
// Version creation / cloning
// ---------------------------------------------------------------------------

export async function createVersion(
  weekId: string,
  actor: SessionUser,
  copyFromVersionId?: string,
): Promise<{ versionId: string; versionNo: number; revision: number; status: string }> {
  assertPermission(actor.role as Role, "timetable:write");
  const week = await prisma.week.findUnique({
    where: { id: weekId },
    select: { id: true, weekNo: true, semesterId: true },
  });
  if (!week) {
    throw new MutationError("WEEK_NOT_FOUND", "Không tìm thấy tuần học.", { weekId }, 404);
  }

  return prisma.$transaction(async (tx) => {
    const max = await tx.timetableVersion.findFirst({
      where: { weekId: week.id },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true },
    });
    const versionNo = (max?.versionNo ?? 0) + 1;
    const version = await tx.timetableVersion.create({
      data: {
        weekId: week.id,
        versionNo,
        status: "DRAFT",
        name: copyFromVersionId
          ? `Bản nháp v${versionNo} (nhân bản)`
          : `Bản nháp v${versionNo}`,
        createdBy: actor.id,
      },
      select: { id: true, revision: true },
    });
    if (copyFromVersionId) {
      const source = await tx.timetableVersion.findUnique({
        where: { id: copyFromVersionId },
        select: { id: true, status: true },
      });
      if (!source) {
        throw new MutationError("VERSION_NOT_FOUND", "Không tìm thấy phiên bản nguồn để nhân bản.", { copyFromVersionId }, 404);
      }
      await tx.timetableEntry.createMany({
        data: (await tx.timetableEntry.findMany({
          where: { versionId: source.id },
          select: {
            academicDayId: true,
            periodId: true,
            classId: true,
            teacherId: true,
            subjectId: true,
            subjectComponentId: true,
            roomId: true,
            notes: true,
            sourceRow: true,
          },
        })).map((row) => ({ ...row, versionId: version.id })),
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.displayName,
        action: "CREATE",
        entityType: "TimetableVersion",
        entityId: version.id,
        after: { versionNo, status: "DRAFT", clonedFrom: copyFromVersionId ?? null },
      },
    });
    return { versionId: version.id, versionNo, revision: version.revision, status: "DRAFT" };
  });
}

// ---------------------------------------------------------------------------
// Validation aggregation for the planner (conflicts + workload warnings)
// ---------------------------------------------------------------------------

export interface VersionValidationReport {
  errors: ValidationResult["errors"];
  warnings: ValidationResult["warnings"];
  workloadIssues: { code: string; message: string; details: Record<string, unknown> }[];
  counts: { errors: number; warnings: number };
}

export async function validateVersion(versionId: string): Promise<VersionValidationReport> {
  const result = await validateVersionEntries(versionId);

  const schoolYearId = await loadSchoolYearIdForVersion(versionId);
  const [assignments, entries, substitutions] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: { schoolYearId, isActive: true, assignmentType: "TEACHING" },
      select: { teacherId: true, lessonsPerWeek: true, classId: true, subjectId: true, subjectComponentId: true },
    }),
    prisma.timetableEntry.findMany({
      where: { versionId },
      select: { id: true, teacherId: true, academicDayId: true, periodId: true, status: true },
    }),
    prisma.substitution.findMany({
      where: { entry: { versionId } },
      select: { entryId: true, originalTeacherId: true, substituteTeacherId: true, status: true },
    }),
  ]);
  const workloads = computeTeacherWorkloads(
    assignments.map((a) => ({ ...a, assignmentType: "TEACHING" })),
    entries,
    substitutions,
  );
  const workloadIssues: VersionValidationReport["workloadIssues"] = [];
  for (const w of workloads.values()) {
    if (w.difference !== 0) {
      workloadIssues.push({
        code: w.difference > 0 ? "WORKLOAD_OVER_EXPECTED" : "WORKLOAD_BELOW_EXPECTED",
        message:
          w.difference > 0
            ? `Tổng số tiết đã xếp vượt số được phân công (chênh ${w.difference}).`
            : `Tổng số tiết đã xếp thiếu so với phân công (thiếu ${-w.difference}).`,
        details: { ...w, teacherId: w.teacherId },
      });
    }
  }
  return {
    errors: result.errors.filter((e) => e.code !== "PUBLISHED_VERSION_MUTATION"),
    warnings: result.warnings,
    workloadIssues,
    counts: {
      errors: result.errors.filter((e) => e.code !== "PUBLISHED_VERSION_MUTATION").length,
      warnings: result.warnings.length,
    },
  };
}

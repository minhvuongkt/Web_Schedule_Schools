import { prisma } from "@/server/db";
import { assertPermission, type Role } from "@/server/domain/roles";
import type { SessionUser } from "@/server/services/auth.service";
import { MutationError } from "@/server/services/timetable-write.service";
import { publishNotificationsChanged } from "@/server/services/notification-events";

/**
 * Live timetable exceptions on PUBLISHED versions: teacher substitution,
 * lesson cancellation, and makeup lessons.
 *
 * These do NOT change the schedule layout (day/period/class/subject), so
 * they bypass the DRAFT-only editing guard — but every operation is
 * transactional, audited (SUBSTITUTE / CANCEL / MAKEUP actions), and fans
 * out notifications. The conflict invariants still apply:
 * - the substitute must be free at the lesson's slot;
 * - a makeup slot must be free for both the class and the teacher.
 */

async function loadEntry(entryId: string) {
  const entry = await prisma.timetableEntry.findUnique({
    where: { id: entryId },
    select: {
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
      version: { select: { status: true, weekId: true, week: { select: { weekNo: true } } } },
      teacher: { select: { id: true, fullName: true, userId: true } },
      class: { select: { code: true } },
      subject: { select: { name: true } },
      subjectComponent: { select: { name: true } },
    },
  });
  if (!entry) {
    throw new MutationError("ENTRY_NOT_FOUND", "Không tìm thấy tiết học.", { entryId }, 404);
  }
  return entry;
}

async function assertManageLive(user: SessionUser): Promise<void> {
  assertPermission(user.role as Role, "timetable:write");
}

/** Substitute must have no active lesson at the slot (owned or substituted). */
async function assertSubstituteFree(
  substituteTeacherId: string,
  versionId: string,
  academicDayId: string,
  periodId: string,
): Promise<void> {
  const clash = await prisma.timetableEntry.findFirst({
    where: {
      versionId,
      academicDayId,
      periodId,
      status: { not: "CANCELLED" },
      OR: [
        { teacherId: substituteTeacherId },
        {
          status: "SUBSTITUTED",
          substitution: { substituteTeacherId, status: "CONFIRMED" },
        },
      ],
    },
    select: { id: true },
  });
  if (clash) {
    throw new MutationError(
      "SUBSTITUTE_UNAVAILABLE",
      "Giáo viên dạy thay đang bận tại thời điểm này.",
      { conflictingEntryId: clash.id },
      409,
    );
  }
}

interface PendingNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, string | number | null>;
  idempotencyKey: string;
}

interface ClassNotification {
  type: string;
  classId: string;
  title: string;
  body: string;
  payload: Record<string, string | number | null>;
  idempotencyKey: string;
}

/**
 * Queues a user-targeted notification to be delivered AFTER the creating
 * transaction commits (flushNotifications) — never inside it: writing on a
 * separate connection mid-transaction could persist an orphan notification
 * if the transaction rolls back.
 */
function queueNotification(
  pending: PendingNotification[],
  teacherUserId: string | null,
  type: string,
  title: string,
  body: string,
  payload: Record<string, string | number | null>,
  idempotencyKey: string,
): void {
  if (!teacherUserId) return;
  pending.push({ userId: teacherUserId, type, title, body, payload, idempotencyKey });
}

/**
 * Queues a CLASS notification (spec §19 "notify class/student"): visible
 * publicly on the class's notifications feed — no user recipients, the
 * payload carries classId so the public query can filter. Draft-only
 * changes are never queued here (spec §18).
 */
function queueClassNotification(
  pending: ClassNotification[],
  type: "TEACHER_CHANGED" | "ROOM_CHANGED" | "LESSON_CANCELLED" | "MAKEUP_LESSON_CREATED",
  classId: string,
  title: string,
  body: string,
  payload: Record<string, string | number | null>,
  idempotencyKey: string,
): void {
  pending.push({ type, classId, title, body, payload: { ...payload, classId }, idempotencyKey });
}

/** Writes queued notifications + fires the SSE push event per user. */
async function flushNotifications(
  pending: PendingNotification[],
  classPending: ClassNotification[] = [],
): Promise<void> {
  const delivered: string[] = [];
  for (const n of pending) {
    const existing = await prisma.notification.findUnique({
      where: { idempotencyKey: n.idempotencyKey },
    });
    if (existing) continue;
    const notification = await prisma.notification.create({
      data: {
        type: n.type,
        title: n.title,
        body: n.body,
        idempotencyKey: n.idempotencyKey,
        payload: { ...n.payload },
      },
    });
    await prisma.notificationRecipient.create({
      data: { notificationId: notification.id, userId: n.userId },
    });
    delivered.push(n.userId);
  }
  // Class notifications: no recipients (public feed), payload carries classId.
  for (const n of classPending) {
    const existing = await prisma.notification.findUnique({
      where: { idempotencyKey: n.idempotencyKey },
    });
    if (existing) continue;
    await prisma.notification.create({
      data: {
        type: n.type,
        title: n.title,
        body: n.body,
        idempotencyKey: n.idempotencyKey,
        payload: { ...n.payload },
      },
    });
  }
  if (delivered.length > 0) {
    publishNotificationsChanged(delivered);
  }
}

async function audit(
  actor: SessionUser,
  action: "SUBSTITUTE" | "CANCEL" | "MAKEUP",
  entityId: string,
  before: unknown,
  after: unknown,
  reason?: string | null,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.displayName,
      action,
      entityType: "TimetableEntry",
      entityId,
      before: before === null ? undefined : (before as object),
      after: after === null ? undefined : (after as object),
      reason: reason ?? undefined,
    },
  });
}

// ---------------------------------------------------------------------------
// Substitutions
// ---------------------------------------------------------------------------

export interface CreateSubstitutionInput {
  entryId: string;
  substituteTeacherId: string;
  reason?: string | null;
  autoConfirm?: boolean;
}

export async function createSubstitution(
  input: CreateSubstitutionInput,
  actor: SessionUser,
): Promise<{ substitutionId: string; status: string }> {
  await assertManageLive(actor);
  const entry = await loadEntry(input.entryId);

  if (entry.version.status !== "PUBLISHED") {
    throw new MutationError(
      "NOT_PUBLISHED",
      "Chỉ áp dụng dạy thay trên phiên bản đã công bố.",
      { versionId: entry.versionId, status: entry.version.status },
      409,
    );
  }
  if (entry.status === "CANCELLED") {
    throw new MutationError("ENTRY_CANCELLED", "Tiết học đã bị hủy.", { entryId: entry.id }, 409);
  }
  if (entry.status === "SUBSTITUTED") {
    throw new MutationError(
      "ALREADY_SUBSTITUTED",
      "Tiết học đã có giáo viên dạy thay.",
      { entryId: entry.id },
      409,
    );
  }
  if (input.substituteTeacherId === entry.teacherId) {
    throw new MutationError(
      "SAME_TEACHER",
      "Giáo viên dạy thay trùng giáo viên gốc.",
      { entryId: entry.id },
      400,
    );
  }
  const substitute = await prisma.teacher.findUnique({
    where: { id: input.substituteTeacherId },
    select: { id: true, fullName: true, isActive: true, userId: true },
  });
  if (!substitute || !substitute.isActive) {
    throw new MutationError("TEACHER_NOT_FOUND", "Không tìm thấy giáo viên dạy thay.", {}, 404);
  }
  await assertSubstituteFree(
    input.substituteTeacherId,
    entry.versionId,
    entry.academicDayId,
    entry.periodId,
  );

  const confirm = input.autoConfirm ?? true;
  const pending: PendingNotification[] = [];
  const classPending: ClassNotification[] = [];
  const lessonLabel = `${entry.subject.name}${entry.subjectComponent ? ` (${entry.subjectComponent.name})` : ""}`;

  const result = await prisma.$transaction(async (t) => {
    const substitution = await t.substitution.create({
      data: {
        entryId: entry.id,
        originalTeacherId: entry.teacherId,
        substituteTeacherId: substitute.id,
        reason: input.reason ?? null,
        status: confirm ? "CONFIRMED" : "PENDING",
      },
    });
    if (confirm) {
      await t.timetableEntry.update({
        where: { id: entry.id },
        data: { status: "SUBSTITUTED" },
      });
    }
    await audit(
      actor,
      "SUBSTITUTE",
      entry.id,
      { status: "NORMAL" },
      { status: confirm ? "SUBSTITUTED" : "NORMAL", substitutionId: substitution.id, substitute: substitute.fullName },
      input.reason ?? undefined,
    );
    if (confirm) {
      queueNotification(
        pending,
        substitute.userId,
        "SUBSTITUTION_ASSIGNED",
        "Bạn được phân công dạy thay",
        `Dạy thay tiết ${lessonLabel} lớp ${entry.class.code}, tuần ${entry.version.week.weekNo}.`,
        { substitutionId: substitution.id, entryId: entry.id },
        `substitution:${substitution.id}`,
      );
      queueClassNotification(
        classPending,
        "TEACHER_CHANGED",
        entry.classId,
        "Thay đổi giáo viên",
        `Tiết ${lessonLabel} lớp ${entry.class.code} do ${substitute.fullName} dạy thay ${entry.teacher.fullName}.`,
        { substitutionId: substitution.id, entryId: entry.id },
        `class-teacher:${substitution.id}`,
      );
    }
    return { substitutionId: substitution.id, status: substitution.status };
  });
  await flushNotifications(pending, classPending);
  return result;
}

export async function confirmSubstitution(
  substitutionId: string,
  actor: SessionUser,
): Promise<{ status: string }> {
  await assertManageLive(actor);
  const substitution = await prisma.substitution.findUnique({
    where: { id: substitutionId },
    include: {
      entry: {
        select: {
          id: true,
          classId: true,
          status: true,
          versionId: true,
          academicDayId: true,
          periodId: true,
          subject: { select: { name: true } },
          subjectComponent: { select: { name: true } },
          class: { select: { code: true } },
          version: { select: { week: { select: { weekNo: true } } } },
        },
      },
    },
  });
  if (!substitution) {
    throw new MutationError("SUBSTITUTION_NOT_FOUND", "Không tìm thấy phân công dạy thay.", { substitutionId }, 404);
  }
  if (substitution.status !== "PENDING") {
    throw new MutationError("INVALID_TRANSITION", "Chỉ phân công đang chờ mới có thể xác nhận.", { status: substitution.status }, 409);
  }
  const entry = substitution.entry;
  await assertSubstituteFree(
    substitution.substituteTeacherId,
    entry.versionId,
    entry.academicDayId,
    entry.periodId,
  );
  const substitute = await prisma.teacher.findUnique({
    where: { id: substitution.substituteTeacherId },
    select: { userId: true, fullName: true },
  });

  const pending: PendingNotification[] = [];
  const classPending: ClassNotification[] = [];
  const lessonLabel = `${entry.subject.name}${entry.subjectComponent ? ` (${entry.subjectComponent.name})` : ""}`;

  const result = await prisma.$transaction(async (t) => {
    await t.substitution.update({
      where: { id: substitutionId },
      data: { status: "CONFIRMED" },
    });
    await t.timetableEntry.update({
      where: { id: entry.id },
      data: { status: "SUBSTITUTED" },
    });
    await audit(
      actor,
      "SUBSTITUTE",
      entry.id,
      { status: "NORMAL" },
      { status: "SUBSTITUTED", substitutionId },
      "Xác nhận dạy thay",
    );
    queueNotification(
      pending,
      substitute?.userId ?? null,
      "SUBSTITUTION_ASSIGNED",
      "Bạn được phân công dạy thay",
      `Dạy thay tiết ${lessonLabel} lớp ${entry.class.code}, tuần ${entry.version.week.weekNo}.`,
      { substitutionId, entryId: entry.id },
      `substitution:${substitutionId}`,
    );
    queueClassNotification(
      classPending,
      "TEACHER_CHANGED",
      entry.classId,
      "Thay đổi giáo viên",
      `Tiết ${lessonLabel} lớp ${entry.class.code} do ${substitute?.fullName ?? ""} dạy thay.`,
      { substitutionId, entryId: entry.id },
      `class-teacher:${substitutionId}`,
    );
    return { status: "CONFIRMED" };
  });
  await flushNotifications(pending, classPending);
  return result;
}

export async function cancelSubstitution(
  substitutionId: string,
  actor: SessionUser,
): Promise<{ status: string }> {
  await assertManageLive(actor);
  const substitution = await prisma.substitution.findUnique({
    where: { id: substitutionId },
    select: { id: true, status: true, entryId: true, entry: { select: { status: true } } },
  });
  if (!substitution) {
    throw new MutationError("SUBSTITUTION_NOT_FOUND", "Không tìm thấy phân công dạy thay.", { substitutionId }, 404);
  }
  if (substitution.status === "CANCELLED") {
    throw new MutationError("INVALID_TRANSITION", "Phân công đã bị hủy trước đó.", { status: substitution.status }, 409);
  }

  return prisma.$transaction(async (t) => {
    await t.substitution.update({
      where: { id: substitutionId },
      data: { status: "CANCELLED" },
    });
    if (substitution.entry.status === "SUBSTITUTED") {
      await t.timetableEntry.update({
        where: { id: substitution.entryId },
        data: { status: "NORMAL" },
      });
    }
    await audit(
      actor,
      "CANCEL",
      substitution.entryId,
      { status: substitution.entry.status },
      { status: substitution.entry.status === "SUBSTITUTED" ? "NORMAL" : substitution.entry.status, substitutionId },
      "Hủy phân công dạy thay",
    );
    return { status: "CANCELLED" };
  });
}

// ---------------------------------------------------------------------------
// Live lesson cancellation (no substitute)
// ---------------------------------------------------------------------------

export async function cancelLesson(
  entryId: string,
  reason: string | null | undefined,
  actor: SessionUser,
): Promise<{ status: string }> {
  await assertManageLive(actor);
  const entry = await loadEntry(entryId);
  if (entry.version.status !== "PUBLISHED") {
    throw new MutationError("NOT_PUBLISHED", "Chỉ hủy tiết trên phiên bản đã công bố.", { versionId: entry.versionId }, 409);
  }
  if (entry.status === "CANCELLED") {
    throw new MutationError("ENTRY_CANCELLED", "Tiết học đã bị hủy.", { entryId: entry.id }, 409);
  }

  const pending: PendingNotification[] = [];
  const classPending: ClassNotification[] = [];
  const lessonLabel = `${entry.subject.name}${entry.subjectComponent ? ` (${entry.subjectComponent.name})` : ""}`;

  const result = await prisma.$transaction(async (t) => {
    await t.timetableEntry.update({
      where: { id: entry.id },
      data: { status: "CANCELLED" },
    });
    await audit(
      actor,
      "CANCEL",
      entry.id,
      { status: entry.status },
      { status: "CANCELLED" },
      reason ?? undefined,
    );
    queueNotification(
      pending,
      entry.teacher.userId,
      "LESSON_CANCELLED",
      "Tiết học bị hủy",
      `Tiết ${lessonLabel} lớp ${entry.class.code}, tuần ${entry.version.week.weekNo} đã bị hủy.`,
      { entryId: entry.id },
      `cancel:${entry.id}`,
    );
    queueClassNotification(
      classPending,
      "LESSON_CANCELLED",
      entry.classId,
      "Tiết học bị hủy",
      `Tiết ${lessonLabel} lớp ${entry.class.code}, tuần ${entry.version.week.weekNo} đã bị hủy.`,
      { entryId: entry.id },
      `class-cancel:${entry.id}`,
    );
    return { status: "CANCELLED" };
  });
  await flushNotifications(pending, classPending);
  return result;
}

// ---------------------------------------------------------------------------
// Makeup lessons
// ---------------------------------------------------------------------------

export interface CreateMakeupInput {
  originalEntryId: string;
  academicDayId: string;
  periodId: string;
  roomId?: string | null;
  reason?: string | null;
}

export async function createMakeupLesson(
  input: CreateMakeupInput,
  actor: SessionUser,
): Promise<{ makeupEntryId: string; makeupLessonId: string }> {
  await assertManageLive(actor);
  const original = await loadEntry(input.originalEntryId);
  if (original.version.status !== "PUBLISHED") {
    throw new MutationError("NOT_PUBLISHED", "Chỉ bổ sung tiết trên phiên bản đã công bố.", { versionId: original.versionId }, 409);
  }
  if (original.status !== "CANCELLED") {
    throw new MutationError(
      "NOT_CANCELLABLE",
      "Chỉ tiết học đã hủy mới cần bổ sung (dạy bù).",
      { entryId: original.id, status: original.status },
      409,
    );
  }

  // The makeup lesson is taught by the original teacher: the slot must be
  // free for both the class and the teacher (DB index backstops the class
  // and teacher slots on create; checked explicitly here for clean errors).
  const clash = await prisma.timetableEntry.findFirst({
    where: {
      versionId: original.versionId,
      academicDayId: input.academicDayId,
      periodId: input.periodId,
      status: { not: "CANCELLED" },
      OR: [{ classId: original.classId }, { teacherId: original.teacherId }],
    },
    select: { id: true },
  });
  if (clash) {
    throw new MutationError(
      "SLOT_DOUBLE_BOOKED",
      "Thời điểm dạy bù bị trùng lịch (lớp hoặc giáo viên).",
      { conflictingEntryId: clash.id },
      409,
    );
  }

  const pending: PendingNotification[] = [];
  const classPending: ClassNotification[] = [];
  const lessonLabel = `${original.subject.name}${original.subjectComponent ? ` (${original.subjectComponent.name})` : ""}`;

  const result = await prisma.$transaction(async (t) => {
    const makeupEntry = await t.timetableEntry.create({
      data: {
        versionId: original.versionId,
        academicDayId: input.academicDayId,
        periodId: input.periodId,
        classId: original.classId,
        subjectId: original.subjectId,
        subjectComponentId: original.subjectComponentId,
        teacherId: original.teacherId,
        roomId: input.roomId ?? original.roomId,
        status: "MAKEUP",
        notes: input.reason ?? "Dạy bù",
      },
      select: { id: true },
    });
    const makeupLesson = await t.makeupLesson.create({
      data: {
        originalEntryId: original.id,
        makeupEntryId: makeupEntry.id,
        reason: input.reason ?? null,
        status: "SCHEDULED",
      },
    });
    await audit(
      actor,
      "MAKEUP",
      makeupEntry.id,
      null,
      { originalEntryId: original.id, makeupLessonId: makeupLesson.id, reason: input.reason ?? null },
      "Dạy bù tiết học đã hủy",
    );
    const day = await t.academicDay.findUnique({
      where: { id: input.academicDayId },
      select: { date: true },
    });
    const dateVi = day
      ? `${String(day.date.getDate()).padStart(2, "0")}/${String(day.date.getMonth() + 1).padStart(2, "0")}`
      : "";
    queueNotification(
      pending,
      original.teacher.userId,
      "MAKEUP_LESSON_CREATED",
      "Bổ sung tiết dạy bù",
      `Tiết ${lessonLabel} lớp ${original.class.code} được dạy bù vào ${dateVi}.`,
      { makeupEntryId: makeupEntry.id, originalEntryId: original.id },
      `makeup:${makeupLesson.id}`,
    );
    queueClassNotification(
      classPending,
      "MAKEUP_LESSON_CREATED",
      original.classId,
      "Bổ sung tiết dạy bù",
      `Tiết ${lessonLabel} lớp ${original.class.code} được dạy bù vào ${dateVi}.`,
      { makeupEntryId: makeupEntry.id, originalEntryId: original.id },
      `class-makeup:${makeupLesson.id}`,
    );
    return { makeupEntryId: makeupEntry.id, makeupLessonId: makeupLesson.id };
  });
  await flushNotifications(pending, classPending);
  return result;
}

export async function cancelMakeupLesson(
  makeupLessonId: string,
  actor: SessionUser,
): Promise<{ status: string }> {
  await assertManageLive(actor);
  const lesson = await prisma.makeupLesson.findUnique({
    where: { id: makeupLessonId },
    select: { id: true, status: true, makeupEntryId: true },
  });
  if (!lesson) {
    throw new MutationError("MAKEUP_NOT_FOUND", "Không tìm thấy tiết dạy bù.", { makeupLessonId }, 404);
  }
  if (lesson.status === "CANCELLED") {
    throw new MutationError("INVALID_TRANSITION", "Tiết dạy bù đã bị hủy.", { status: lesson.status }, 409);
  }

  return prisma.$transaction(async (t) => {
    await t.makeupLesson.update({
      where: { id: makeupLessonId },
      data: { status: "CANCELLED" },
    });
    if (lesson.makeupEntryId) {
      await t.timetableEntry.update({
        where: { id: lesson.makeupEntryId },
        data: { status: "CANCELLED" },
      });
    }
    await audit(actor, "CANCEL", lesson.makeupEntryId ?? makeupLessonId, { status: "SCHEDULED" }, { status: "CANCELLED" }, "Hủy tiết dạy bù");
    return { status: "CANCELLED" };
  });
}

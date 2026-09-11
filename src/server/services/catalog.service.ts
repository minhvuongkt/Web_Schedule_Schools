import { prisma } from "@/server/db";
import { assertPermission, type Role } from "@/server/domain/roles";
import type { SessionUser } from "@/server/services/auth.service";
import { MutationError } from "@/server/services/timetable-write.service";
import { normalizeName } from "@/server/domain/normalize";

/**
 * Reference-catalog management: teachers, subjects (+ components), rooms.
 * Gated on assignments:manage (SUPER_ADMIN + TIMETABLE_ADMIN — the data-entry
 * role that also owns Excel import and phân công).
 *
 * Deletion policy: a record may only be deleted while nothing references it
 * (no schedule entries, assignments, substitutions, linked account, …).
 * Otherwise the delete is refused with a clear reason — historical timetable
 * data must keep resolving to its teacher/subject/room. Teachers who are done
 * teaching should be deactivated (isActive=false) instead.
 */

function assertManage(user: SessionUser): void {
  assertPermission(user.role as Role, "assignments:manage");
}

async function schoolIdOfActiveYear(): Promise<string> {
  const year = await prisma.schoolYear.findFirst({
    where: { status: "ACTIVE" },
    select: { schoolId: true },
    orderBy: [{ startDate: "desc" }],
  });
  if (!year) {
    throw new MutationError("NO_SCHOOL_YEAR", "Không tìm thấy năm học đang hoạt động.", {}, 400);
  }
  return year.schoolId;
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function audit(
  t: PrismaTx,
  actor: SessionUser,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await t.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.displayName,
      action,
      entityType,
      entityId,
      before: before ?? undefined,
      after: after ?? undefined,
    },
  });
}

// --- teachers --------------------------------------------------------------

export interface TeacherCatalogRow {
  id: string;
  code: string;
  fullName: string;
  shortName: string | null;
  specialty: string | null;
  position: string | null;
  isActive: boolean;
  hasAccount: boolean;
  entryCount: number;
}

export async function listTeacherCatalog(user: SessionUser): Promise<TeacherCatalogRow[]> {
  assertManage(user);
  const schoolId = await schoolIdOfActiveYear();
  const rows = await prisma.teacher.findMany({
    where: { schoolId },
    select: {
      id: true,
      code: true,
      fullName: true,
      shortName: true,
      specialty: true,
      position: true,
      isActive: true,
      userId: true,
      _count: { select: { entries: true } },
    },
    orderBy: { code: "asc" },
  });
  return rows.map((t) => ({
    id: t.id,
    code: t.code,
    fullName: t.fullName,
    shortName: t.shortName,
    specialty: t.specialty,
    position: t.position,
    isActive: t.isActive,
    hasAccount: t.userId !== null,
    entryCount: t._count.entries,
  }));
}

export interface TeacherInput {
  code: string;
  fullName: string;
  shortName?: string | null;
  specialty?: string | null;
  position?: string | null;
}

const TEACHER_POSITIONS = ["GV", "Hiệu trưởng", "P.Hiệu trưởng", "Tổ trưởng", "Tổ phó"];

export async function createTeacher(
  input: TeacherInput,
  actor: SessionUser,
): Promise<{ teacherId: string }> {
  assertManage(actor);
  const code = input.code.trim().toUpperCase();
  const fullName = normalizeName(input.fullName.trim());
  if (!code || !fullName) {
    throw new MutationError("VALIDATION_ERROR", "Mã và họ tên giáo viên không được để trống.", {}, 400);
  }
  const schoolId = await schoolIdOfActiveYear();
  const existing = await prisma.teacher.findFirst({
    where: { schoolId, OR: [{ code }, { fullName }] },
    select: { code: true, fullName: true },
  });
  if (existing) {
    throw new MutationError(
      "DUPLICATE",
      existing.code === code
        ? `Mã giáo viên ${code} đã tồn tại.`
        : `Giáo viên "${existing.fullName}" đã tồn tại.`,
      { code, fullName },
      409,
    );
  }

  return prisma.$transaction(async (t) => {
    const teacher = await t.teacher.create({
      data: {
        schoolId,
        code,
        fullName,
        shortName: input.shortName?.trim() || null,
        specialty: input.specialty?.trim() || null,
        position: input.position?.trim() || null,
      },
      select: { id: true },
    });
    await audit(t, actor, "CREATE", "Teacher", teacher.id, null, { code, fullName });
    return { teacherId: teacher.id };
  });
}

export async function updateTeacher(
  teacherId: string,
  patch: {
    fullName?: string;
    shortName?: string | null;
    specialty?: string | null;
    position?: string | null;
    isActive?: boolean;
  },
  actor: SessionUser,
): Promise<{ teacherId: string }> {
  assertManage(actor);
  const existing = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, code: true, fullName: true, shortName: true, specialty: true, position: true, isActive: true },
  });
  if (!existing) {
    throw new MutationError("TEACHER_NOT_FOUND", "Không tìm thấy giáo viên.", { teacherId }, 404);
  }
  if (patch.position && !TEACHER_POSITIONS.some((p) => p.toLowerCase() === patch.position!.trim().toLowerCase())) {
    throw new MutationError(
      "VALIDATION_ERROR",
      `Chức danh không hợp lệ (một trong: ${TEACHER_POSITIONS.join(", ")}).`,
      { position: patch.position },
      400,
    );
  }
  const next = {
    fullName: patch.fullName !== undefined ? normalizeName(patch.fullName.trim()) : existing.fullName,
    shortName: patch.shortName !== undefined ? patch.shortName?.trim() || null : existing.shortName,
    specialty: patch.specialty !== undefined ? patch.specialty?.trim() || null : existing.specialty,
    position: patch.position !== undefined ? patch.position?.trim() || null : existing.position,
    isActive: patch.isActive ?? existing.isActive,
  };
  if (!next.fullName) {
    throw new MutationError("VALIDATION_ERROR", "Họ tên giáo viên không được để trống.", {}, 400);
  }
  if (patch.fullName !== undefined && next.fullName !== existing.fullName) {
    const clash = await prisma.teacher.findFirst({
      where: { fullName: next.fullName, id: { not: teacherId } },
      select: { code: true },
    });
    if (clash) {
      throw new MutationError("DUPLICATE", `Giáo viên "${next.fullName}" đã tồn tại (mã ${clash.code}).`, {}, 409);
    }
  }

  return prisma.$transaction(async (t) => {
    await t.teacher.update({ where: { id: teacherId }, data: next });
    await audit(t, actor, "UPDATE", "Teacher", teacherId, existing, next);
    return { teacherId };
  });
}

// --- subjects & components ---------------------------------------------------

export interface SubjectCatalogRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  components: { id: string; code: string; name: string }[];
  entryCount: number;
}

export async function listSubjectCatalog(user: SessionUser): Promise<SubjectCatalogRow[]> {
  assertManage(user);
  const schoolId = await schoolIdOfActiveYear();
  const rows = await prisma.subject.findMany({
    where: { schoolId },
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      components: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" } },
      _count: { select: { entries: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    category: s.category,
    components: s.components,
    entryCount: s._count.entries,
  }));
}

export async function createSubject(
  input: { code: string; name: string; category?: string | null },
  actor: SessionUser,
): Promise<{ subjectId: string }> {
  assertManage(actor);
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) {
    throw new MutationError("VALIDATION_ERROR", "Mã và tên môn học không được để trống.", {}, 400);
  }
  const schoolId = await schoolIdOfActiveYear();
  const existing = await prisma.subject.findFirst({
    where: { schoolId, OR: [{ code }, { name }] },
    select: { code: true, name: true },
  });
  if (existing) {
    throw new MutationError(
      "DUPLICATE",
      existing.code === code ? `Mã môn học ${code} đã tồn tại.` : `Môn học "${existing.name}" đã tồn tại.`,
      { code, name },
      409,
    );
  }

  return prisma.$transaction(async (t) => {
    const subject = await t.subject.create({
      data: { schoolId, code, name, category: input.category?.trim() || null },
      select: { id: true },
    });
    await audit(t, actor, "CREATE", "Subject", subject.id, null, { code, name });
    return { subjectId: subject.id };
  });
}

export async function updateSubject(
  subjectId: string,
  patch: { name?: string; category?: string | null },
  actor: SessionUser,
): Promise<{ subjectId: string }> {
  assertManage(actor);
  const existing = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, code: true, name: true, category: true },
  });
  if (!existing) {
    throw new MutationError("SUBJECT_NOT_FOUND", "Không tìm thấy môn học.", { subjectId }, 404);
  }
  const next = {
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    category: patch.category !== undefined ? patch.category?.trim() || null : existing.category,
  };
  if (!next.name) {
    throw new MutationError("VALIDATION_ERROR", "Tên môn học không được để trống.", {}, 400);
  }
  if (next.name !== existing.name) {
    const clash = await prisma.subject.findFirst({
      where: { name: next.name, id: { not: subjectId } },
      select: { code: true },
    });
    if (clash) {
      throw new MutationError("DUPLICATE", `Môn học "${next.name}" đã tồn tại (mã ${clash.code}).`, {}, 409);
    }
  }

  return prisma.$transaction(async (t) => {
    await t.subject.update({ where: { id: subjectId }, data: next });
    await audit(t, actor, "UPDATE", "Subject", subjectId, existing, next);
    return { subjectId };
  });
}

export async function createSubjectComponent(
  input: { subjectId: string; code: string; name: string },
  actor: SessionUser,
): Promise<{ componentId: string }> {
  assertManage(actor);
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) {
    throw new MutationError("VALIDATION_ERROR", "Mã và tên phân môn không được để trống.", {}, 400);
  }
  const subject = await prisma.subject.findUnique({
    where: { id: input.subjectId },
    select: { id: true, name: true },
  });
  if (!subject) {
    throw new MutationError("SUBJECT_NOT_FOUND", "Không tìm thấy môn học.", { subjectId: input.subjectId }, 404);
  }
  const clash = await prisma.subjectComponent.findFirst({
    where: { subjectId: subject.id, OR: [{ code }, { name }] },
    select: { code: true, name: true },
  });
  if (clash) {
    throw new MutationError(
      "DUPLICATE",
      clash.code === code ? `Phân môn ${code} đã tồn tại.` : `Phân môn "${clash.name}" đã tồn tại.`,
      {},
      409,
    );
  }

  return prisma.$transaction(async (t) => {
    const component = await t.subjectComponent.create({
      data: { subjectId: subject.id, code, name },
      select: { id: true },
    });
    await audit(t, actor, "CREATE", "SubjectComponent", component.id, null, {
      subjectId: subject.id,
      code,
      name,
    });
    return { componentId: component.id };
  });
}

export async function updateSubjectComponent(
  componentId: string,
  patch: { name?: string },
  actor: SessionUser,
): Promise<{ componentId: string }> {
  assertManage(actor);
  const existing = await prisma.subjectComponent.findUnique({
    where: { id: componentId },
    select: { id: true, code: true, name: true, subjectId: true },
  });
  if (!existing) {
    throw new MutationError("COMPONENT_NOT_FOUND", "Không tìm thấy phân môn.", { componentId }, 404);
  }
  const next = { name: patch.name !== undefined ? patch.name.trim() : existing.name };
  if (!next.name) {
    throw new MutationError("VALIDATION_ERROR", "Tên phân môn không được để trống.", {}, 400);
  }

  return prisma.$transaction(async (t) => {
    await t.subjectComponent.update({ where: { id: componentId }, data: next });
    await audit(t, actor, "UPDATE", "SubjectComponent", componentId, existing, next);
    return { componentId };
  });
}

// --- rooms -------------------------------------------------------------------

export interface RoomCatalogRow {
  id: string;
  code: string;
  name: string | null;
  roomType: string | null;
  capacity: number | null;
  entryCount: number;
}

export async function listRoomCatalog(user: SessionUser): Promise<RoomCatalogRow[]> {
  assertManage(user);
  const schoolId = await schoolIdOfActiveYear();
  const rows = await prisma.room.findMany({
    where: { schoolId },
    select: {
      id: true,
      code: true,
      name: true,
      roomType: true,
      capacity: true,
      _count: { select: { entries: true } },
    },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    roomType: r.roomType,
    capacity: r.capacity,
    entryCount: r._count.entries,
  }));
}

export async function createRoom(
  input: { code: string; name?: string | null; roomType?: string | null; capacity?: number | null },
  actor: SessionUser,
): Promise<{ roomId: string }> {
  assertManage(actor);
  const code = input.code.trim().toUpperCase();
  if (!code) {
    throw new MutationError("VALIDATION_ERROR", "Mã phòng học không được để trống.", {}, 400);
  }
  const schoolId = await schoolIdOfActiveYear();
  const existing = await prisma.room.findFirst({ where: { schoolId, code }, select: { code: true } });
  if (existing) {
    throw new MutationError("DUPLICATE", `Mã phòng học ${code} đã tồn tại.`, { code }, 409);
  }

  return prisma.$transaction(async (t) => {
    const room = await t.room.create({
      data: {
        schoolId,
        code,
        name: input.name?.trim() || null,
        roomType: input.roomType?.trim() || null,
        capacity: input.capacity ?? null,
      },
      select: { id: true },
    });
    await audit(t, actor, "CREATE", "Room", room.id, null, { code });
    return { roomId: room.id };
  });
}

export async function updateRoom(
  roomId: string,
  patch: { name?: string | null; roomType?: string | null; capacity?: number | null },
  actor: SessionUser,
): Promise<{ roomId: string }> {
  assertManage(actor);
  const existing = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, code: true, name: true, roomType: true, capacity: true },
  });
  if (!existing) {
    throw new MutationError("ROOM_NOT_FOUND", "Không tìm thấy phòng học.", { roomId }, 404);
  }
  const next = {
    name: patch.name !== undefined ? patch.name?.trim() || null : existing.name,
    roomType: patch.roomType !== undefined ? patch.roomType?.trim() || null : existing.roomType,
    capacity: patch.capacity !== undefined ? patch.capacity : existing.capacity,
  };

  return prisma.$transaction(async (t) => {
    await t.room.update({ where: { id: roomId }, data: next });
    await audit(t, actor, "UPDATE", "Room", roomId, existing, next);
    return { roomId };
  });
}

// --- deletes -----------------------------------------------------------------

function inUseError(message: string): MutationError {
  return new MutationError("IN_USE", message, {}, 409);
}

/** A foreign-key error means a concurrent write referenced the row first. */
function isForeignKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2003"
  );
}

/** Deletes a teacher only when nothing references them (or their account). */
export async function deleteTeacher(teacherId: string, actor: SessionUser): Promise<void> {
  assertManage(actor);
  const existing = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      code: true,
      fullName: true,
      userId: true,
      _count: {
        select: {
          assignments: true,
          availability: true,
          entries: true,
          homeroomClasses: true,
          substitutionsFrom: true,
          substitutionsTo: true,
          aliases: true,
        },
      },
    },
  });
  if (!existing) {
    throw new MutationError("TEACHER_NOT_FOUND", "Không tìm thấy giáo viên.", { teacherId }, 404);
  }
  if (existing.userId) {
    throw inUseError(
      "Giáo viên đã gắn tài khoản đăng nhập nên không thể xóa. Hãy khóa tài khoản (trang Tài khoản) hoặc chuyển sang trạng thái Ngừng dạy.",
    );
  }
  const counts = existing._count;
  if (
    counts.assignments + counts.availability + counts.entries + counts.homeroomClasses +
      counts.substitutionsFrom + counts.substitutionsTo + counts.aliases >
    0
  ) {
    throw inUseError(
      "Giáo viên đang được dùng trong phân công, lịch dạy hoặc dạy thay nên không thể xóa. Hãy chuyển sang trạng thái Ngừng dạy.",
    );
  }
  try {
    await prisma.$transaction(async (t) => {
      await t.teacher.delete({ where: { id: teacherId } });
      await audit(t, actor, "DELETE", "Teacher", teacherId, {
        code: existing.code,
        fullName: existing.fullName,
      }, null);
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw inUseError("Giáo viên vừa được dùng ở nơi khác nên không thể xóa.");
    }
    throw error;
  }
}

/** Deletes a subject only when it has no components and no usage history. */
export async function deleteSubject(subjectId: string, actor: SessionUser): Promise<void> {
  assertManage(actor);
  const existing = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: {
      id: true,
      code: true,
      name: true,
      _count: {
        select: { components: true, assignments: true, requirements: true, entries: true },
      },
    },
  });
  if (!existing) {
    throw new MutationError("SUBJECT_NOT_FOUND", "Không tìm thấy môn học.", { subjectId }, 404);
  }
  const counts = existing._count;
  if (counts.entries + counts.assignments + counts.requirements > 0) {
    throw inUseError(
      "Môn học đang được dùng trong lịch dạy, phân công hoặc yêu cầu giảng dạy nên không thể xóa.",
    );
  }
  if (counts.components > 0) {
    throw inUseError("Môn học còn phân môn. Hãy xóa các phân môn trước rồi mới xóa môn học.");
  }
  try {
    await prisma.$transaction(async (t) => {
      await t.subject.delete({ where: { id: subjectId } });
      await audit(t, actor, "DELETE", "Subject", subjectId, {
        code: existing.code,
        name: existing.name,
      }, null);
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw inUseError("Môn học vừa được dùng ở nơi khác nên không thể xóa.");
    }
    throw error;
  }
}

/** Deletes a subject component only when no entry/assignment references it. */
export async function deleteSubjectComponent(
  componentId: string,
  actor: SessionUser,
): Promise<void> {
  assertManage(actor);
  const existing = await prisma.subjectComponent.findUnique({
    where: { id: componentId },
    select: {
      id: true,
      code: true,
      name: true,
      subjectId: true,
      _count: { select: { assignments: true, requirements: true, entries: true } },
    },
  });
  if (!existing) {
    throw new MutationError("COMPONENT_NOT_FOUND", "Không tìm thấy phân môn.", { componentId }, 404);
  }
  const counts = existing._count;
  if (counts.assignments + counts.requirements + counts.entries > 0) {
    throw inUseError(
      "Phân môn đang được dùng trong lịch dạy hoặc phân công nên không thể xóa.",
    );
  }
  await prisma.$transaction(async (t) => {
    await t.subjectComponent.delete({ where: { id: componentId } });
    await audit(t, actor, "DELETE", "SubjectComponent", componentId, {
      code: existing.code,
      name: existing.name,
      subjectId: existing.subjectId,
    }, null);
  });
}

/** Deletes a room only when no timetable entry uses it. */
export async function deleteRoom(roomId: string, actor: SessionUser): Promise<void> {
  assertManage(actor);
  const existing = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, code: true, name: true, _count: { select: { entries: true } } },
  });
  if (!existing) {
    throw new MutationError("ROOM_NOT_FOUND", "Không tìm thấy phòng học.", { roomId }, 404);
  }
  if (existing._count.entries > 0) {
    throw inUseError("Phòng học đang được dùng trong lịch dạy nên không thể xóa.");
  }
  try {
    await prisma.$transaction(async (t) => {
      await t.room.delete({ where: { id: roomId } });
      await audit(t, actor, "DELETE", "Room", roomId, {
        code: existing.code,
        name: existing.name,
      }, null);
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw inUseError("Phòng học vừa được dùng ở nơi khác nên không thể xóa.");
    }
    throw error;
  }
}

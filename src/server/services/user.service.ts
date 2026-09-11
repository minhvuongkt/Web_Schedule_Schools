import { randomBytes } from "node:crypto";

import { prisma } from "@/server/db";
import { hashPassword } from "@/server/domain/password";
import { assertPermission, isRole, ROLES, type Role } from "@/server/domain/roles";
import type { SessionUser } from "@/server/services/auth.service";
import { MutationError } from "@/server/services/timetable-write.service";

/**
 * User account management, gated on users:manage (SUPER_ADMIN only).
 * Usernames are immutable stable identifiers (lowercase). Deactivation is a
 * soft delete: it revokes sessions and blocks login but preserves audit
 * history and notification recipients. At least one active SUPER_ADMIN must
 * always remain; nobody may deactivate or demote their own account.
 */

function assertManage(user: SessionUser): void {
  assertPermission(user.role as Role, "users:manage");
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 8;
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

async function audit(
  t: PrismaTx,
  actor: SessionUser,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason?: string,
): Promise<void> {
  await t.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.displayName,
      action,
      entityType: "USER",
      entityId,
      before: before ?? undefined,
      after: after ?? undefined,
      reason: reason ?? undefined,
    },
  });
}

async function assertTeacherLinkable(
  t: PrismaTx,
  teacherId: string,
  excludeUserId?: string,
): Promise<{ code: string; fullName: string }> {
  const teacher = await t.teacher.findUnique({
    where: { id: teacherId },
    select: { code: true, fullName: true, userId: true },
  });
  if (!teacher) {
    throw new MutationError("NOT_FOUND", "Không tìm thấy giáo viên.", {}, 404);
  }
  if (teacher.userId !== null && teacher.userId !== excludeUserId) {
    throw new MutationError(
      "TEACHER_LINKED",
      `Giáo viên ${teacher.fullName} đã được gắn với tài khoản khác.`,
      {},
      409,
    );
  }
  return { code: teacher.code, fullName: teacher.fullName };
}

const USER_COLUMNS = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  onboardingCompletedAt: true,
  createdAt: true,
  teacher: { select: { id: true, code: true, fullName: true } },
  authSessions: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { createdAt: true },
  },
} as const;

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: string;
  isActive: boolean;
  /** False while the first-login wizard (email + own password) is pending. */
  onboardingCompleted: boolean;
  createdAt: string;
  teacher: { id: string; code: string; fullName: string } | null;
  lastLoginAt: string | null;
}

function toRow(user: {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: string;
  isActive: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  teacher: { id: string; code: string; fullName: string } | null;
  authSessions: { createdAt: Date }[];
}): UserRow {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    onboardingCompleted: user.onboardingCompletedAt !== null,
    createdAt: user.createdAt.toISOString(),
    teacher: user.teacher,
    lastLoginAt:
      user.authSessions.length > 0
        ? user.authSessions[0].createdAt.toISOString()
        : null,
  };
}

export async function listUsers(user: SessionUser): Promise<UserRow[]> {
  assertManage(user);
  const users = await prisma.user.findMany({
    select: USER_COLUMNS,
    orderBy: [{ isActive: "desc" }, { username: "asc" }],
  });
  return users.map(toRow);
}

/** Active teachers usable for linking (plus the one already linked). */
export async function listLinkableTeachers(
  user: SessionUser,
): Promise<{ id: string; code: string; fullName: string; linkedUserId: string | null }[]> {
  assertManage(user);
  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    select: { id: true, code: true, fullName: true, userId: true },
    orderBy: { code: "asc" },
  });
  return teachers.map((t) => ({
    id: t.id,
    code: t.code,
    fullName: t.fullName,
    linkedUserId: t.userId,
  }));
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  role: string;
  teacherId?: string | null;
}

export async function createUser(
  input: CreateUserInput,
  actor: SessionUser,
): Promise<{ user: UserRow; temporaryPassword?: undefined }> {
  assertManage(actor);
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new MutationError(
      "VALIDATION_ERROR",
      "Tên đăng nhập gồm 3–32 ký tự a–z, 0–9, dấu chấm, gạch dưới hoặc gạch ngang.",
      {},
      400,
    );
  }
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 120) {
    throw new MutationError("VALIDATION_ERROR", "Tên hiển thị phải từ 2 đến 120 ký tự.", {}, 400);
  }
  if (input.password.length < PASSWORD_MIN) {
    throw new MutationError("VALIDATION_ERROR", `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`, {}, 400);
  }
  if (!isRole(input.role)) {
    throw new MutationError("VALIDATION_ERROR", `Vai trò phải thuộc ${ROLES.join(", ")}.`, {}, 400);
  }

  return prisma.$transaction(async (t) => {
    const clash = await t.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (clash) {
      throw new MutationError("USERNAME_TAKEN", "Tên đăng nhập đã tồn tại.", {}, 409);
    }

    if (input.teacherId) {
      await assertTeacherLinkable(t, input.teacherId);
    }

    // Email is deliberately NOT settable here: teachers enter their own
    // address (and confirm a code sent to it) in the first-login wizard.
    const created = await t.user.create({
      data: {
        username,
        displayName,
        role: input.role,
        passwordHash: hashPassword(input.password),
      },
      select: USER_COLUMNS,
    });

    if (input.teacherId && (input.role === "TEACHER" || input.role === "PRINCIPAL")) {
      await t.teacher.update({
        where: { id: input.teacherId },
        data: { userId: created.id },
      });
    }

    await audit(t, actor, "CREATE", created.id, null, {
      username,
      displayName,
      role: input.role,
      teacherId: input.teacherId ?? null,
    }, "account created");
    return { user: toRow(created) };
  });
}

export interface UpdateUserInput {
  displayName?: string;
  role?: string;
  teacherId?: string | null;
  isActive?: boolean;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: SessionUser,
): Promise<UserRow> {
  assertManage(actor);
  return prisma.$transaction(async (t) => {
    const before = await t.user.findUnique({ where: { id }, select: USER_COLUMNS });
    if (!before) {
      throw new MutationError("NOT_FOUND", "Không tìm thấy tài khoản.", {}, 404);
    }

    const nextRole = input.role !== undefined ? input.role : before.role;
    if (input.role !== undefined && !isRole(input.role)) {
      throw new MutationError("VALIDATION_ERROR", `Vai trò phải thuộc ${ROLES.join(", ")}.`, {}, 400);
    }
    const nextActive = input.isActive !== undefined ? input.isActive : before.isActive;
    if (input.displayName !== undefined) {
      const displayName = input.displayName.trim();
      if (displayName.length < 2 || displayName.length > 120) {
        throw new MutationError("VALIDATION_ERROR", "Tên hiển thị phải từ 2 đến 120 ký tự.", {}, 400);
      }
    }

    const demotesFromSuperAdmin =
      before.role === "SUPER_ADMIN" && (nextRole !== "SUPER_ADMIN" || !nextActive);
    if (demotesFromSuperAdmin) {
      if (before.id === actor.id) {
        throw new MutationError(
          "SELF_DEMOTE",
          "Bạn không thể tự hạ quyền hoặc khóa tài khoản SUPER_ADMIN của chính mình.",
          {},
          409,
        );
      }
      const otherActiveSuperAdmins = await t.user.count({
        where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } },
      });
      if (otherActiveSuperAdmins === 0) {
        throw new MutationError(
          "LAST_SUPER_ADMIN",
          "Hệ thống phải duy trì ít nhất một SUPER_ADMIN đang hoạt động.",
          {},
          409,
        );
      }
    }
    if (before.id === actor.id && input.isActive === false) {
      throw new MutationError("SELF_DEMOTE", "Bạn không thể tự khóa tài khoản của chính mình.", {}, 409);
    }

    const linkableRoles = nextRole === "TEACHER" || nextRole === "PRINCIPAL";
    const nextTeacherId =
      input.teacherId !== undefined
        ? linkableRoles
          ? input.teacherId
          : null
        : linkableRoles
          ? before.teacher?.id ?? null
          : null;
    if (nextTeacherId) {
      await assertTeacherLinkable(t, nextTeacherId, id);
    }

    if (before.teacher && before.teacher.id !== nextTeacherId) {
      await t.teacher.update({ where: { id: before.teacher.id }, data: { userId: null } });
    }
    if (nextTeacherId && nextTeacherId !== before.teacher?.id) {
      await t.teacher.update({ where: { id: nextTeacherId }, data: { userId: id } });
    }

    // Email is teacher-owned: it is never edited from the admin console
    // (only the owner can change it via the code-verified account page).
    const updated = await t.user.update({
      where: { id },
      data: {
        displayName: input.displayName !== undefined ? input.displayName.trim() : undefined,
        role: input.role,
        isActive: input.isActive,
      },
      select: USER_COLUMNS,
    });

    // Deactivation also revokes every session immediately.
    if (input.isActive === false) {
      await t.authSession.deleteMany({ where: { userId: id } });
    }

    await audit(
      t,
      actor,
      "UPDATE",
      id,
      {
        displayName: before.displayName,
        role: before.role,
        teacherId: before.teacher?.id ?? null,
        isActive: before.isActive,
      },
      {
        displayName: updated.displayName,
        role: updated.role,
        teacherId: updated.teacher?.id ?? null,
        isActive: updated.isActive,
      },
    );
    return toRow(updated);
  });
}

/** Resets the password (generates one when omitted) and revokes sessions. */
export async function resetUserPassword(
  id: string,
  password: string | undefined,
  actor: SessionUser,
): Promise<{ user: UserRow; newPassword: string }> {
  assertManage(actor);
  const newPassword = password && password.trim() !== "" ? password : generatePassword();
  if (newPassword.length < PASSWORD_MIN) {
    throw new MutationError("VALIDATION_ERROR", `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`, {}, 400);
  }
  return prisma.$transaction(async (t) => {
    const user = await t.user.findUnique({ where: { id }, select: USER_COLUMNS });
    if (!user) {
      throw new MutationError("NOT_FOUND", "Không tìm thấy tài khoản.", {}, 404);
    }
    await t.user.update({
      where: { id },
      data: {
        passwordHash: hashPassword(newPassword),
        // The user must set their own password (+ confirm email) again at the
        // next login: the admin knows this temporary password.
        onboardingCompletedAt: null,
        emailVerifiedAt: null,
      },
    });
    await t.authSession.deleteMany({ where: { userId: id } });
    await audit(t, actor, "UPDATE", id, null, { username: user.username }, "password reset — onboarding restarted");
    return { user: toRow(user), newPassword };
  });
}

/**
 * Permanently deletes an account. Sessions, push subscriptions and
 * notification recipients are removed, teacher/student links are unlinked,
 * and the audit log survives (no FK on actorId). Same safety rails as
 * deactivation: no self-delete and at least one active SUPER_ADMIN remains.
 */
export async function deleteUser(id: string, actor: SessionUser): Promise<void> {
  assertManage(actor);
  await prisma.$transaction(async (t) => {
    const before = await t.user.findUnique({ where: { id }, select: USER_COLUMNS });
    if (!before) {
      throw new MutationError("NOT_FOUND", "Không tìm thấy tài khoản.", {}, 404);
    }
    if (before.id === actor.id) {
      throw new MutationError(
        "SELF_DELETE",
        "Bạn không thể xóa tài khoản của chính mình.",
        {},
        409,
      );
    }
    if (before.role === "SUPER_ADMIN" && before.isActive) {
      const otherActiveSuperAdmins = await t.user.count({
        where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } },
      });
      if (otherActiveSuperAdmins === 0) {
        throw new MutationError(
          "LAST_SUPER_ADMIN",
          "Hệ thống phải duy trì ít nhất một SUPER_ADMIN đang hoạt động.",
          {},
          409,
        );
      }
    }

    // One-sided links live on Teacher/Student — unlink before the delete.
    await t.teacher.updateMany({ where: { userId: id }, data: { userId: null } });
    await t.student.updateMany({ where: { userId: id }, data: { userId: null } });
    // Rows owned by the account must go with it.
    await t.authSession.deleteMany({ where: { userId: id } });
    await t.pushSubscription.deleteMany({ where: { userId: id } });
    await t.notificationRecipient.deleteMany({ where: { userId: id } });
    await t.user.delete({ where: { id } });

    await audit(
      t,
      actor,
      "DELETE",
      id,
      {
        username: before.username,
        displayName: before.displayName,
        email: before.email,
        role: before.role,
        teacherId: before.teacher?.id ?? null,
        isActive: before.isActive,
      },
      null,
      "account deleted",
    );
  });
}

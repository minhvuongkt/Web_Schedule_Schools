import { prisma } from "@/server/db";
import {
  audienceTargets,
  isAudience,
  SELECTABLE_ROLES,
  type Audience,
} from "@/server/domain/notification-audience";
import { assertPermission, type Role } from "@/server/domain/roles";
import { publishNotificationsChanged } from "@/server/services/notification-events";
import { MutationError } from "@/server/services/timetable-write.service";
import type { SessionUser } from "@/server/services/auth.service";

/**
 * Admin broadcast announcements (notifications:send).
 *
 * - Teacher/staff audiences get an in-app notification row per active user
 *   (+ Web Push fan-out via publishNotificationsChanged), type ANNOUNCEMENT.
 * - Student audiences also get one public CLASS_ANNOUNCEMENT row per active
 *   class (the /hsv handbook is class-based and login-free).
 * - SELECTED sends only to the explicitly chosen account ids.
 *
 * The ANNOUNCEMENT row is always created as the send record (even when no
 * account matches the audience) so the admin history stays complete.
 */

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 1000;
const RECIPIENT_NAMES_STORED = 20;

export interface SendAnnouncementInput {
  audience: Audience;
  title: string;
  body: string;
  /** Required when audience is SELECTED: account ids to notify. */
  userIds?: string[];
}

export interface AnnouncementRow {
  id: string;
  audience: Audience;
  title: string;
  body: string;
  createdAt: string;
  recipientCount: number;
  classCount: number;
  /** Display names of selected recipients (capped) — SELECTED sends only. */
  recipientNames: string[];
}

export interface SelectableRecipient {
  id: string;
  username: string;
  displayName: string;
  role: string;
  teacherCode: string | null;
}

function assertSend(user: SessionUser): void {
  assertPermission(user.role as Role, "notifications:send");
}

interface AnnouncementPayload {
  audience?: string;
  recipientCount?: number;
  classCount?: number;
  recipientNames?: unknown;
}

function toRow(notification: {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  payload: unknown;
}): AnnouncementRow {
  const payload = (notification.payload ?? {}) as AnnouncementPayload;
  const names = Array.isArray(payload.recipientNames)
    ? payload.recipientNames.filter((n): n is string => typeof n === "string")
    : [];
  return {
    id: notification.id,
    audience: isAudience(payload.audience ?? "") ? (payload.audience as Audience) : "ALL",
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt.toISOString(),
    recipientCount: payload.recipientCount ?? 0,
    classCount: payload.classCount ?? 0,
    recipientNames: names,
  };
}

/** Active accounts the admin can pick individually (non-admin roles). */
export async function listSelectableRecipients(
  actor: SessionUser,
): Promise<SelectableRecipient[]> {
  assertSend(actor);
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: [...SELECTABLE_ROLES] } },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      teacher: { select: { code: true } },
    },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
  });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    teacherCode: u.teacher?.code ?? null,
  }));
}

export async function sendAnnouncement(
  input: SendAnnouncementInput,
  actor: SessionUser,
): Promise<AnnouncementRow> {
  assertSend(actor);
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 2 || title.length > ANNOUNCEMENT_TITLE_MAX) {
    throw new MutationError(
      "VALIDATION_ERROR",
      `Tiêu đề phải từ 2 đến ${ANNOUNCEMENT_TITLE_MAX} ký tự.`,
      {},
      400,
    );
  }
  if (body.length < 1 || body.length > ANNOUNCEMENT_BODY_MAX) {
    throw new MutationError(
      "VALIDATION_ERROR",
      `Nội dung phải từ 1 đến ${ANNOUNCEMENT_BODY_MAX} ký tự.`,
      {},
      400,
    );
  }
  if (!isAudience(input.audience)) {
    throw new MutationError("VALIDATION_ERROR", "Đối tượng nhận không hợp lệ.", {}, 400);
  }

  const { roles, classAnnouncement } = audienceTargets(input.audience);
  const selectedIds =
    input.audience === "SELECTED"
      ? [...new Set((input.userIds ?? []).filter((id) => id.trim() !== ""))]
      : [];
  if (input.audience === "SELECTED" && selectedIds.length === 0) {
    throw new MutationError(
      "VALIDATION_ERROR",
      "Hãy chọn ít nhất một người nhận.",
      {},
      400,
    );
  }

  const [recipients, classes] = await Promise.all([
    input.audience === "SELECTED"
      ? prisma.user.findMany({
          where: {
            id: { in: selectedIds },
            isActive: true,
            role: { in: [...SELECTABLE_ROLES] },
          },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : prisma.user.findMany({
          where: { role: { in: [...roles] }, isActive: true },
          select: { id: true, displayName: true },
        }),
    classAnnouncement
      ? prisma.class.findMany({
          where: { schoolYear: { status: "ACTIVE" } },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
  ]);

  if (input.audience === "SELECTED" && recipients.length === 0) {
    throw new MutationError(
      "VALIDATION_ERROR",
      "Không tìm thấy tài khoản hợp lệ trong danh sách đã chọn.",
      {},
      400,
    );
  }

  const created = await prisma.$transaction(async (t) => {
    const notification = await t.notification.create({
      data: {
        type: "ANNOUNCEMENT",
        title,
        body,
        payload: {
          audience: input.audience,
          recipientCount: recipients.length,
          classCount: classes.length,
          recipientNames:
            input.audience === "SELECTED"
              ? recipients.slice(0, RECIPIENT_NAMES_STORED).map((r) => r.displayName)
              : undefined,
        },
      },
    });
    if (recipients.length > 0) {
      await t.notificationRecipient.createMany({
        data: recipients.map((r) => ({
          notificationId: notification.id,
          userId: r.id,
        })),
      });
    }
    for (const cls of classes) {
      await t.notification.create({
        data: {
          type: "CLASS_ANNOUNCEMENT",
          title,
          body,
          payload: { classId: cls.id, audience: input.audience },
        },
      });
    }
    await t.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.displayName,
        action: "NOTIFY",
        entityType: "Notification",
        entityId: notification.id,
        after: {
          audience: input.audience,
          title,
          recipients: recipients.length,
          classes: classes.length,
        },
      },
    });
    return notification;
  });

  // SSE + Web Push fan-out after commit (never inside the transaction).
  if (recipients.length > 0) {
    publishNotificationsChanged(recipients.map((r) => r.id));
  }

  return toRow(created);
}

/** Newest sends first (admin history). */
export async function listAnnouncements(
  actor: SessionUser,
  limit = 20,
): Promise<AnnouncementRow[]> {
  assertSend(actor);
  const rows = await prisma.notification.findMany({
    where: { type: "ANNOUNCEMENT" },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, title: true, body: true, createdAt: true, payload: true },
  });
  return rows.map(toRow);
}

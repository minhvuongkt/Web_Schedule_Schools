import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/services/auth.service";

/**
 * Notification read state (per-recipient rows). Kept out of the route so
 * other surfaces can reuse it; always scoped to the calling user.
 */

export interface MarkReadInput {
  ids?: string[];
  all?: boolean;
}

/** Marks the user's notification recipients read; returns rows updated. */
export async function markNotificationsRead(
  user: SessionUser,
  input: MarkReadInput,
): Promise<number> {
  if (input.all) {
    const { count } = await prisma.notificationRecipient.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
  const ids = input.ids ?? [];
  const { count } = await prisma.notificationRecipient.updateMany({
    where: { userId: user.id, notificationId: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}

/**
 * Clears the user's inbox: removes only their per-recipient rows, never the
 * shared Notification (other recipients keep their copy). Returns rows deleted.
 */
export async function clearNotifications(user: SessionUser): Promise<number> {
  const { count } = await prisma.notificationRecipient.deleteMany({
    where: { userId: user.id },
  });
  return count;
}

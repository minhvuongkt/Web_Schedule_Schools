import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireApiUser } from "@/server/api/timetable-api";
import type { SessionUser } from "@/server/auth/session";
import { clearNotifications } from "@/server/services/notification.service";

/**
 * GET /api/notifications — the caller's notifications (newest first).
 * DELETE /api/notifications — clear the caller's inbox.
 * Mark-read lives at POST /api/notifications/read.
 */

export async function GET(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const user: SessionUser = auth.user;

  const recipients = await prisma.notificationRecipient.findMany({
    where: { userId: user.id },
    select: {
      readAt: true,
      notification: {
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          createdAt: true,
        },
      },
    },
    orderBy: { notification: { createdAt: "desc" } },
    take: 100,
  });

  return NextResponse.json({
    notifications: recipients.map((r) => ({
      id: r.notification.id,
      type: r.notification.type,
      title: r.notification.title,
      body: r.notification.body,
      createdAt: r.notification.createdAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
    })),
  });
}

/** DELETE /api/notifications — clear the caller's whole inbox. */
export async function DELETE(): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const cleared = await clearNotifications(auth.user);
  return NextResponse.json({ ok: true, cleared });
}

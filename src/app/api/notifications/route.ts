import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireApiUser } from "@/server/api/timetable-api";
import type { SessionUser } from "@/server/auth/session";

/**
 * GET /api/notifications — the caller's notifications (newest first).
 * POST /api/notifications/read — body {ids} or {all}.
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

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  let body: { ids?: string[]; all?: boolean };
  try {
    body = (await request.json()) as { ids?: string[]; all?: boolean };
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "JSON không hợp lệ." } }, { status: 400 });
  }

  if (body.all) {
    const { count } = await prisma.notificationRecipient.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true, updated: count });
  }
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const { count } = await prisma.notificationRecipient.updateMany({
      where: { userId: user.id, notificationId: { in: body.ids }, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true, updated: count });
  }
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Cần ids hoặc all=true." } },
    { status: 400 },
  );
}

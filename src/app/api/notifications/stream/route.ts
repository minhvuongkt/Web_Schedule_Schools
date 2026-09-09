import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/api/timetable-api";
import { prisma } from "@/server/db";
import { subscribeToNotifications } from "@/server/services/notification-events";

/**
 * GET /api/notifications/stream — Server-Sent Events stream of the caller's
 * notifications. Events: `notification` (new row available — the client
 * refetches), heartbeat comments every 25s to keep proxies from closing the
 * connection. Stream ends when the client aborts (request.signal).
 */

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;
const CLEANUP_POLL_MS = 60_000;

export async function GET(request: Request): Promise<NextResponse | Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cleanup: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // initial snapshot: current unread count (lets clients reconcile)
      void prisma.notificationRecipient
        .count({ where: { userId, readAt: null } })
        .then((unread) => send("state", { unread }))
        .catch(() => send("state", { unread: 0 }));

      unsubscribe = subscribeToNotifications((event) => {
        if (event.userId !== userId) return;
        send("notification", { at: new Date().toISOString() });
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // stream already closed
        }
      }, HEARTBEAT_MS);

      // safety net: if the in-process bus misses something (multi-instance
      // future), a slow poll reconciles unread state once a minute.
      cleanup = setInterval(() => {
        void prisma.notificationRecipient
          .count({ where: { userId, readAt: null } })
          .then((unread) => send("state", { unread }))
          .catch(() => undefined);
      }, CLEANUP_POLL_MS);

      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        if (cleanup) clearInterval(cleanup);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (cleanup) clearInterval(cleanup);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes to the SSE push channel (/api/notifications/stream) and
 * triggers a server-component refresh (router.refresh) whenever a new
 * notification arrives — keeping this page live without client-side data
 * fetching. Renders a subtle live indicator so teachers know updates are
 * pushed.
 */
export function NotificationLiveRefresher() {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let source: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/notifications/stream");

      source.addEventListener("state", () => {
        if (!closed) setLive(true);
      });
      source.addEventListener("notification", () => {
        if (closed) return;
        setUpdatedAt(
          new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );
      });
      source.onopen = () => {
        if (!closed) setLive(true);
      };
      source.onerror = () => {
        if (closed) return;
        setLive(false);
        source?.close();
        // EventSource auto-reconnects, but a manual backoff avoids tight
        // loops when the session has expired (401 closes the stream).
        reconnect = setTimeout(connect, 10_000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      source?.close();
    };
  }, []);

  // Refresh the server component when a push arrives (delegated here so the
  // page stays a server component).
  useEffect(() => {
    if (!updatedAt) return;
    router.refresh();
  }, [updatedAt, router]);

  return (
    <p className="text-xs text-zinc-400">
      {live ? "● Đang nhận thông báo trực tiếp" : "○ Tự động cập nhật khi có thông báo mới"}
      {updatedAt ? ` · cập nhật lúc ${updatedAt}` : ""}
    </p>
  );
}

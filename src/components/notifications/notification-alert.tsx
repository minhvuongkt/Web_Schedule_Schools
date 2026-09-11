"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { alertKey, shouldShowAlert } from "./alert-state";

/**
 * In-app notification alert. Shown at the top of every staff page when the
 * signed-in user has unread notifications — the fallback for devices where
 * Web Push / lock-screen notifications do not fire. Dismissing remembers the
 * current unread set; a new notification brings the banner back. The full
 * inbox lives at /gv/thong-bao (where the banner is hidden).
 */

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
}

const DISMISS_KEY = "notif-alert-dismissed";

export function NotificationAlert() {
  const pathname = usePathname();
  const [unread, setUnread] = useState<NotificationItem[]>([]);
  // Lazy initializer (client-only) — reading storage in an effect would set
  // state synchronously there, which the react-hooks rules disallow. The
  // value cannot affect SSR output because the banner never renders before
  // the first fetch resolves.
  const [dismissed, setDismissed] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) return;
        const data = (await response.json()) as { notifications: NotificationItem[] };
        if (!cancelled) {
          setUnread(data.notifications.filter((n) => n.readAt === null));
        }
      } catch {
        /* offline or session expired — keep the previous state */
      }
    };
    void load();

    const timer = setInterval(() => void load(), 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    // Live updates: the SSE stream pings when new notifications commit.
    let source: EventSource | null = null;
    try {
      source = new EventSource("/api/notifications/stream");
      source.addEventListener("notification", () => void load());
    } catch {
      /* EventSource unsupported — polling still covers it */
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      source?.close();
    };
  }, []);

  function dismiss() {
    const key = alertKey(unread.map((n) => n.id));
    setDismissed(key);
    try {
      window.localStorage.setItem(DISMISS_KEY, key);
    } catch {
      /* ignore */
    }
  }

  if (pathname === "/gv/thong-bao") return null;
  if (!shouldShowAlert(unread.map((n) => n.id), dismissed)) return null;
  const latest = unread[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print border-b border-amber-200 bg-amber-50"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <Icon name="bell" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            {unread.length === 1
              ? "Bạn có 1 thông báo mới"
              : `Bạn có ${unread.length} thông báo chưa đọc`}
          </p>
          <p className="mt-0.5 truncate text-sm text-amber-800/90">
            {latest?.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/gv/thong-bao"
            className="inline-flex min-h-9 items-center rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-800 active:scale-95"
          >
            Xem thông báo
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Đóng dải thông báo"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-amber-700 transition-colors hover:bg-amber-100"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

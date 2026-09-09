"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import { formatDateTimeVi } from "@/components/leadership/format";
import { notificationTypeLabelVi, type NotificationDto } from "./types";

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export function NotificationCard({ notification }: { notification: NotificationDto }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = notification.readAt === null;

  async function markRead(): Promise<void> {
    if (!unread || busy || pending) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [notification.id] }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(
          body?.error?.message ?? "Không đánh dấu được thông báo là đã đọc.",
        );
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Không kết nối được máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (!unread) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void markRead();
    }
  }

  return (
    <article
      role={unread ? "button" : undefined}
      tabIndex={unread ? 0 : undefined}
      onClick={unread ? () => void markRead() : undefined}
      onKeyDown={handleKeyDown}
      className={`relative overflow-hidden rounded-lg border bg-white p-4 ${
        unread
          ? "cursor-pointer border-zinc-200 transition-colors hover:border-zinc-400"
          : "border-zinc-200"
      }`}
    >
      {unread ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
          {notificationTypeLabelVi(notification.type)}
        </span>
        {unread ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Mới
          </span>
        ) : null}
        <time
          dateTime={notification.createdAt}
          className="ml-auto text-xs text-zinc-500"
        >
          {formatDateTimeVi(notification.createdAt)}
        </time>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-zinc-900">
        {notification.title}
      </h3>
      {notification.body ? (
        <p className="mt-1 text-sm text-zinc-600">{notification.body}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </article>
  );
}

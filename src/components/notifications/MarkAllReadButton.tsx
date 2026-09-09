"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markAllRead(): Promise<void> {
    if (busy || pending) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(
          body?.error?.message ?? "Không thể đánh dấu tất cả là đã đọc.",
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

  const disabled = busy || pending;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void markAllRead()}
        disabled={disabled}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {disabled ? "Đang xử lý…" : "Đánh dấu tất cả đã đọc"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

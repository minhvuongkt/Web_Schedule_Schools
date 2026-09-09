"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

interface VersionActionsProps {
  versionId: string;
  action: "approve" | "publish";
  label: string;
}

export function VersionActions({ versionId, action, label }: VersionActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    if (busy || pending) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/timetable/versions/${encodeURIComponent(versionId)}/${action}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(
          body?.error?.message ?? `Thao tác thất bại (HTTP ${response.status}).`,
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
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void run()}
        disabled={disabled}
        className={
          action === "approve"
            ? "rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-800 transition-colors hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            : "rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {disabled ? "Đang xử lý…" : label}
      </button>
      {error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

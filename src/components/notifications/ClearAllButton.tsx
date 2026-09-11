"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";

/**
 * Clears the whole notification inbox. Destructive → always behind an
 * explicit confirmation dialog. Only the caller's recipient rows are
 * removed; the shared notifications stay for other users.
 */
export function ClearAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clearAll(): Promise<void> {
    if (busy || pending) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications", { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Không xóa được thông báo.");
        return;
      }
      setConfirmOpen(false);
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
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition-colors hover:border-rose-500 active:scale-95"
      >
        <Icon name="trash-2" size={14} />
        Xóa tất cả
      </button>

      {confirmOpen ? (
        <Modal title="Xóa tất cả thông báo?" onClose={() => setConfirmOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p className="font-semibold">Thao tác này không thể hoàn tác.</p>
              <p className="mt-1">
                Toàn bộ {count} thông báo trong hộp thư của bạn sẽ bị xóa vĩnh
                viễn. Hộp thư của những người dùng khác không bị ảnh hưởng.
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void clearAll()}
                disabled={disabled}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="trash-2" size={15} />
                {disabled ? "Đang xóa…" : "Xóa tất cả"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

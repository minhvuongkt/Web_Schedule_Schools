"use client";

import { useEffect, type ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { Portal } from "@/components/ui/portal";

/**
 * Shared confirmation dialog (rendered via Portal so it anchors to the
 * viewport regardless of page scroll / animated ancestors). Esc cancels;
 * the safe action gets focus first.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Hủy",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="no-print fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-sm"
        onClick={onCancel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Đóng"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="mt-2 text-sm leading-relaxed text-zinc-600">
            {description}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                tone === "danger"
                  ? "bg-red-700 hover:bg-red-800"
                  : "bg-blue-700 hover:bg-blue-800"
              }`}
            >
              {busy ? "Đang xử lý…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

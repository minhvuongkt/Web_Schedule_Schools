"use client";

import { Icon } from "@/components/ui/icon";
import { Portal } from "@/components/ui/portal";

/**
 * Floating feedback toast (via Portal — viewport-anchored). Light-bordered to
 * match the app's banner language. Top-center on phones (clears bottom
 * sheets), bottom-right on desktop.
 */
export function Toast({
  kind,
  message,
  onClose,
}: {
  kind: "error" | "success";
  message: string;
  onClose: () => void;
}) {
  const tone =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <Portal>
      <div
        role="status"
        className={`no-print fixed inset-x-4 top-4 z-50 flex animate-fade-in items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:max-w-sm ${tone}`}
      >
        <Icon
          name={kind === "error" ? "x" : "check"}
          size={16}
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
          aria-label="Đóng thông báo"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </Portal>
  );
}

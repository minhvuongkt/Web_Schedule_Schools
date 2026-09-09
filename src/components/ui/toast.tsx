"use client";

import { Icon } from "@/components/ui/icon";
import { Portal } from "@/components/ui/portal";

/**
 * Floating feedback toast (via Portal — viewport-anchored). Light-bordered to
 * match the app's banner language.
 *
 * Placement ladder (never covers interactive controls):
 * - <lg:  top-[4.5rem] — clears the 56px mobile top bar AND the sticky
 *         toolbar's first row; sheets live at the bottom, so no conflict.
 * - lg–xl: top-right (no rail yet, transient overlap with the toolbar's
 *         actions row is acceptable — toasts auto-dismiss).
 * - ≥xl:  bottom-right, offset left of the 320px sticky rail (right-[22rem]).
 *
 * z-[70] sits above sheets (50) and dialogs (60) per the app z-ladder.
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
        className={`no-print fixed inset-x-4 top-[4.5rem] z-[70] flex animate-fade-in items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg lg:inset-x-auto lg:right-4 lg:top-4 xl:bottom-4 xl:right-[22rem] xl:top-auto sm:max-w-sm ${tone}`}
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

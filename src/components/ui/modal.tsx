"use client";

import { useEffect, type ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { Portal } from "@/components/ui/portal";
import { useScrollLock } from "@/components/ui/use-scroll-lock";

/**
 * Shared dialog: bottom sheet on phones, centered modal on ≥sm. Escape and
 * backdrop click close it; body scroll locks while open.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        className="no-print fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="max-h-[90vh] w-full max-w-lg animate-scale-in overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Đóng"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

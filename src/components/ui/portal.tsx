"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * Renders children into document.body so fixed-position overlays (dialogs,
 * toasts) escape any transformed ancestor (e.g. the template wrapper's
 * enter animation) that would otherwise become their containing block.
 */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

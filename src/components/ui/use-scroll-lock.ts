"use client";

import { useEffect } from "react";

/**
 * Body scroll lock for modal surfaces (sheets, dialogs, drawer).
 * `position: fixed` + offset restore is the only pattern iOS Safari
 * reliably honors (plain overflow:hidden still rubber-bands). Ref-counted
 * so stacked surfaces (sheet + confirm dialog) unlock correctly.
 */
let lockCount = 0;
let savedScrollY = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.width = "100%";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}

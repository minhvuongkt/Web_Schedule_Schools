"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe media query hook. `matchMedia` runs only in the browser snapshot;
 * the server snapshot returns `null` until hydration completes so first
 * paint can stay conservative (e.g. treat narrow screens as mobile).
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = (onChange: () => void): (() => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}

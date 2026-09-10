import type { ReactNode } from "react";

/**
 * Root template: Next.js re-mounts this wrapper on every navigation, so the
 * fade-in class gives each page a soft enter transition (disabled
 * automatically for prefers-reduced-motion users via globals.css).
 * The flex column chain (html h-full → body flex-col → this wrapper →
 * main flex-1) keeps sticky footers and full-height layouts working.
 *
 * IMPORTANT: this wrapper must never run a TRANSFORM animation (fade-up).
 * Chromium keeps fill-mode:both transform animations as a containing block
 * for position:fixed descendants — the computed transform stays an identity
 * matrix forever, which breaks every fixed/sticky overlay (sidebar, drawer,
 * bottom sheets, modals, toasts): they stretch to the wrapper's full
 * document height instead of the viewport. Opacity-only (fade-in) is safe:
 * opacity creates a stacking context but never a containing block.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col animate-fade-in">{children}</div>;
}

import type { ReactNode } from "react";

/**
 * Root template: Next.js re-mounts this wrapper on every navigation, so the
 * fade-up class gives each page a soft enter transition (disabled
 * automatically for prefers-reduced-motion users via globals.css).
 * The flex column chain (html h-full → body flex-col → this wrapper →
 * main flex-1) keeps sticky footers and full-height layouts working.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col animate-fade-up">{children}</div>;
}

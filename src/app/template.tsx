import type { ReactNode } from "react";

/**
 * Root template: Next.js re-mounts this wrapper on every navigation, so the
 * fade-up class gives each page a soft enter transition (disabled
 * automatically for prefers-reduced-motion users via globals.css).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}

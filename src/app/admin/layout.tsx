import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Admin area layout — metadata only. Page chrome comes from AppShell inside
 * each page. The manifest makes the admin install separate from the student
 * and teacher apps (distinct id + start_url).
 */
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requireTeacher } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Lịch dạy — Măng Cành",
    manifest: "/gv.webmanifest",
  };
}

/**
 * Teacher area layout. Page chrome (brand, nav, user chip, logout) comes
 * from AppShell inside each page — a second sticky header here used to
 * fight the shell's mobile top bar for top:0, hiding the logout button.
 */
export default async function TeacherAreaLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireTeacher();

  return <div className="flex flex-1 flex-col bg-zinc-50">{children}</div>;
}

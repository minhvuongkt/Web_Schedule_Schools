import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Ban giám hiệu — Măng Cành",
    // Leadership installs the manager app (same as /admin).
    manifest: "/admin.webmanifest",
  };
}

export const dynamic = "force-dynamic";

export default async function LeadershipLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("/bg");
  if (!can(user.role, "workload:read-all")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  return <div className="flex flex-1 flex-col bg-zinc-50">{children}</div>;
}

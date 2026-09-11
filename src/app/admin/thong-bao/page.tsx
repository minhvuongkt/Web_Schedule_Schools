import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AnnouncementApp } from "@/components/announcements/announcement-app";
import { AppShell } from "@/components/site/app-shell";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";

export const metadata: Metadata = {
  title: "Gửi thông báo",
};

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const user = await requireUser("/admin/thong-bao");
  if (!can(user.role, "notifications:send")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  return (
    <AppShell page="Gửi thông báo" user={user}>
      <AnnouncementApp />
    </AppShell>
  );
}

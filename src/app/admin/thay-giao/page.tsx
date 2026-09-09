import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";
import { AppShell } from "@/components/site/app-shell";
import { LiveOpsApp } from "@/components/live-ops/live-ops-app";

export const metadata: Metadata = {
  title: "Dạy thay & dạy bù",
};

export const dynamic = "force-dynamic";

export default async function SubstitutionsPage() {
  const user = await requireUser("/admin/thay-giao");
  if (!can(user.role, "timetable:write")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  return (
    <AppShell page="Dạy thay & dạy bù" user={user}>
      <LiveOpsApp />
    </AppShell>
  );
}

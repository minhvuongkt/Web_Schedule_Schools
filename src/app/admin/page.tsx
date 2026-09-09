import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";
import { AppShell } from "@/components/site/app-shell";
import { PlannerApp } from "@/components/planner/planner-app";

export const metadata: Metadata = {
  title: "Xếp thời khóa biểu",
};

export const dynamic = "force-dynamic";

export default async function AdminPlannerPage() {
  const user = await requireUser("/admin");
  if (!can(user.role, "timetable:read-all")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  return (
    <AppShell page="Xếp thời khóa biểu" user={user}>
      <PlannerApp user={{ role: user.role, displayName: user.displayName }} />
    </AppShell>
  );
}

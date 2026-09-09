import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";
import { UsersApp } from "@/components/users/users-app";

export const metadata: Metadata = {
  title: "Tài khoản — Quản lý người dùng",
};

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireUser("/admin/tai-khoan");
  if (!can(user.role, "users:manage")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  return <UsersApp user={{ displayName: user.displayName, role: user.role }} />;
}

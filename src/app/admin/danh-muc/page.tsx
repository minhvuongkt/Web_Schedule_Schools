import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";
import { CatalogApp } from "@/components/catalog/catalog-app";

export const metadata: Metadata = {
  title: "Danh mục — Giáo viên, môn học, phòng học",
};

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await requireUser("/admin/danh-muc");
  if (!can(user.role, "assignments:manage")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  return <CatalogApp userDisplayName={user.displayName} />;
}

import type { Metadata } from "next";

import { AccountApp } from "@/components/account/account-app";
import { AppShell } from "@/components/site/app-shell";
import { roleLabelVi } from "@/components/leadership/labels";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Tài khoản của tôi",
};

export const dynamic = "force-dynamic";

/** Self-service account page (email + password) for every signed-in user. */
export default async function AccountPage() {
  const user = await requireUser("/tai-khoan");

  return (
    <AppShell page="Tài khoản của tôi" user={user}>
      <AccountApp
        username={user.username}
        displayName={user.displayName}
        roleLabel={roleLabelVi(user.role)}
        initialEmail={user.email ?? ""}
      />
    </AppShell>
  );
}

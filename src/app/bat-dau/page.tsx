import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/account/onboarding-wizard";
import { getCurrentUser } from "@/server/auth/session";
import { homePathForRole } from "@/server/services/auth.service";

export const metadata: Metadata = {
  title: "Thiết lập tài khoản — Măng Cành",
};

export const dynamic = "force-dynamic";

/**
 * First-login wizard (all roles). Deliberately NOT behind requireUser: that
 * guard redirects here, so the page itself resolves the session directly.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/dang-nhap?next=/bat-dau");
  }
  if (user.onboardingCompleted) {
    redirect(homePathForRole(user.role));
  }

  return (
    <OnboardingWizard
      displayName={user.displayName}
      username={user.username}
      initialEmail={user.email ?? ""}
      homePath={homePathForRole(user.role)}
    />
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  resolveSessionUser,
  type SessionUser,
} from "@/server/services/auth.service";

/**
 * Server-side auth guards for pages/layouts/server functions. RBAC checks
 * happen here (and in every API route handler) — never rely on frontend
 * hiding alone (master prompt §4).
 */

export type { SessionUser };

/** Current user or null (no redirect). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSessionUser(token);
}

/**
 * Requires any authenticated user; redirects to /dang-nhap otherwise.
 * Users who have not finished the first-login wizard (email + own password)
 * are redirected to /bat-dau from every protected page; the wizard itself
 * uses getCurrentUser so there is no loop.
 */
export async function requireUser(returnTo = "/gv"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/dang-nhap?next=${encodeURIComponent(returnTo)}`);
  }
  if (!user.onboardingCompleted) {
    redirect("/bat-dau");
  }
  return user;
}

/**
 * Requires a user linked to a Teacher record (personal teaching view).
 * Redirects authenticated-but-unlinked users to a friendly 403 page.
 */
export async function requireTeacher(): Promise<SessionUser & { teacherId: string }> {
  const user = await requireUser();
  if (!user.teacherId) {
    redirect("/khong-co-quyen?ly-do=khong-phai-giao-vien");
  }
  return user as SessionUser & { teacherId: string };
}

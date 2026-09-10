import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { WORKSPACE_BY_ROLE, isStaffRole } from "@/components/site/workspace";
import { getCurrentUser } from "@/server/auth/session";
import type { SessionUser } from "@/server/services/auth.service";

/**
 * Shared site chrome for public pages (timetable, student handbook, QR
 * deep-links). Carries the landing page's warm paper-and-green school
 * identity so the whole public surface feels like one product.
 *
 * The header resolves the session itself: logged-in visitors get a compact
 * user chip plus a direct workspace button (staff) instead of the login
 * button — never both.
 */

/** Compact avatar + display name pill (name hidden on very small screens). */
export function UserChip({ user }: { user: SessionUser }) {
  const initial = user.displayName.trim().charAt(0).toUpperCase();
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 sm:inline-flex"
      title={user.displayName}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">
        {initial}
      </span>
      <span className="max-w-28 truncate">{user.displayName}</span>
    </span>
  );
}

/** Direct entry into the logged-in user's workspace. */
export function WorkspaceButton({
  href,
  label,
  compact = false,
}: {
  href: string;
  label: string;
  /** Icon-only below sm (label still exposed via aria-label). */
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-emerald-800 active:scale-95"
    >
      <Icon name="user" size={14} />
      {compact ? (
        <span className="hidden sm:inline">{label}</span>
      ) : (
        <span>{label}</span>
      )}
    </Link>
  );
}

function LoginButton() {
  return (
    <Link
      href="/dang-nhap"
      className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-emerald-800 active:scale-95"
    >
      <Icon name="login" size={14} />
      <span className="hidden sm:inline">Đăng nhập</span>
    </Link>
  );
}

export async function PublicHeader({ current }: { current?: "tkb" | "hsv" | "login" }) {
  const user = await getCurrentUser().catch(() => null);
  const workspace = user ? WORKSPACE_BY_ROLE[user.role] : undefined;
  const staffWorkspace = user && isStaffRole(user.role) ? workspace : undefined;

  const navItem = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-emerald-100 text-emerald-800"
          : "text-stone-600 hover:bg-stone-900/5 hover:text-stone-900"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#FAF7EF]/90 text-stone-900 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          title="Trang chủ"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
            <Icon name="graduation-cap" size={15} />
          </span>
          <span className="hidden sm:block">Măng Cành</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          {navItem("/tkb", "Thời khóa biểu", current === "tkb")}
          <span className="hidden sm:block">{navItem("/hsv", "Sổ tay học sinh", current === "hsv")}</span>
          {user ? (
            <>
              <UserChip user={user} />
              {staffWorkspace ? (
                <WorkspaceButton
                  href={staffWorkspace.href}
                  label={staffWorkspace.label}
                  compact
                />
              ) : null}
            </>
          ) : current === "login" ? null : (
            <LoginButton />
          )}
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="no-print mt-auto border-t border-stone-200 bg-[#FAF7EF]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-stone-500">
        <span>Trường PTDTBT TH và THCS Măng Cành · Năm học 2026–2027</span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="shield-check" size={13} />
          Chỉ hiển thị phiên bản đã công bố
        </span>
      </div>
    </footer>
  );
}

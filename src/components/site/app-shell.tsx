"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { logoutAction } from "@/app/dang-nhap/actions";
import { roleLabelVi } from "@/components/leadership/labels";
import { Icon, type IconName } from "@/components/ui/icon";
import { useScrollLock } from "@/components/ui/use-scroll-lock";
import { can, type Permission, type Role } from "@/server/domain/roles";

/**
 * Sidebar-first app chrome for every internal page (everything except the
 * public landing / student surfaces). Replaces the old top navbar, whose
 * items overflowed and obscured text on narrow screens.
 *
 * - ≥lg: fixed left sidebar (w-60) — brand, grouped nav (RBAC-filtered),
 *   user chip + logout pinned at the bottom. A "Thu gọn" toggle collapses
 *   it to icon-only rails (w-16, labels → title tooltips); the choice is
 *   remembered in localStorage.
 * - <lg: sticky top bar (h-14) with a menu button; the sidebar becomes a
 *   slide-in drawer with a backdrop (body scroll locked while open). The
 *   drawer always shows full labels — collapse is a desktop-only concept.
 *
 * Z-LADDER (keep in sync across the app):
 *   20 page sticky toolbars · 30 mobile top bar / sheet backdrops / student
 *   bottom nav · 40 desktop sidebar / drawer backdrop · 50 drawer / bottom
 *   sheets (entry panel, action sheet) · 60 dialogs (ConfirmDialog, catalog
 *   Modal, workload popover) · 70 toasts.
 * Page-level sticky toolbars use `top-14 lg:top-0` (clears the mobile bar).
 */

const COLLAPSED_KEY = "appshell-collapsed";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  permission?: Permission;
  teacherOnly?: boolean;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Thời khóa biểu",
    items: [
      { href: "/admin", label: "Xếp thời khóa biểu", icon: "calendar", permission: "timetable:read-all" },
      { href: "/admin/thay-giao", label: "Dạy thay & dạy bù", icon: "refresh-cw", permission: "timetable:write" },
      { href: "/admin/danh-muc", label: "Danh mục trường học", icon: "book-open", permission: "assignments:manage" },
      { href: "/admin/thong-bao", label: "Gửi thông báo", icon: "megaphone", permission: "notifications:send" },
      { href: "/admin/tai-khoan", label: "Tài khoản người dùng", icon: "key-round", permission: "users:manage" },
      { href: "/admin/import", label: "Nhập từ Excel", icon: "file-spreadsheet", permission: "import:excel" },
      { href: "/admin/audit", label: "Nhật ký thao tác", icon: "history-icon", permission: "audit:read" },
    ],
  },
  {
    title: "Ban giám hiệu",
    items: [
      { href: "/bg", label: "Tổng quan", icon: "chart-column", permission: "workload:read-all" },
      { href: "/bg/phan-cong", label: "Phân công giảng dạy", icon: "users-2", permission: "workload:read-all" },
    ],
  },
  {
    title: "Cá nhân",
    items: [
      { href: "/gv", label: "Lịch dạy của tôi", icon: "user", teacherOnly: true },
      { href: "/gv/thong-bao", label: "Thông báo", icon: "bell", teacherOnly: true },
      { href: "/tkb", label: "Xem thời khóa biểu", icon: "external-link" },
      { href: "/huong-dan", label: "Hướng dẫn sử dụng", icon: "sparkles" },
    ],
  },
];

export function AppShell({
  page,
  user,
  children,
}: {
  page: string;
  user: { displayName: string; role: Role; teacherId?: string | null };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useScrollLock(open);

  // Restore the saved collapse preference after mount (async so the state
  // setter never runs synchronously inside the effect body, and so SSR
  // markup matches the first client render).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = window.localStorage.getItem(COLLAPSED_KEY);
        if (!cancelled && saved === "1") setCollapsed(true);
      } catch {
        /* storage unavailable (private mode) — keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.teacherOnly && !user.teacherId) return false;
      if (item.permission && !can(user.role, item.permission)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);

  /**
   * Shared nav body. `isCollapsed` only ever differs from the state on the
   * desktop sidebar; the mobile drawer always renders full labels.
   * `showToggle` renders the collapse button (desktop sidebar only).
   */
  const renderNav = (isCollapsed: boolean, showToggle: boolean) => (
    <>
      <Link
        href="/"
        onClick={() => setOpen(false)}
        title={isCollapsed ? "Măng Cành — Trang chủ" : undefined}
        className={`flex items-center rounded-lg p-2 transition-colors hover:bg-zinc-100 ${
          isCollapsed ? "justify-center" : "gap-2.5"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
          <Icon name="calendar" size={17} />
        </span>
        {isCollapsed ? null : (
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight text-zinc-900">
              Măng Cành
            </span>
            <span className="block text-[11px] leading-tight text-zinc-500">
              Thời khóa biểu điện tử
            </span>
          </span>
        )}
      </Link>

      <nav className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto" aria-label="Điều hướng chính">
        {sections.map((section) => (
          <div key={section.title}>
            {isCollapsed ? (
              <div className="mx-auto my-2 h-px w-8 bg-zinc-200" aria-hidden="true" />
            ) : (
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      title={isCollapsed ? item.label : undefined}
                      className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                        isCollapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-2"
                      } ${
                        active
                          ? "bg-blue-50 text-blue-800"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      }`}
                    >
                      <Icon
                        name={item.icon}
                        size={17}
                        className={active ? "text-blue-700" : "text-zinc-400"}
                      />
                      {isCollapsed ? null : (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-200 pt-3">
        {showToggle ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            aria-pressed={isCollapsed}
            title={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            className={`mb-2 flex items-center rounded-lg text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 ${
              isCollapsed ? "w-full justify-center px-0 py-2" : "w-full gap-2.5 px-2.5 py-2"
            }`}
          >
            <Icon name={isCollapsed ? "chevron-right" : "chevron-left"} size={16} />
            {isCollapsed ? null : <span>Thu gọn</span>}
          </button>
        ) : null}

        {isCollapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"
              title={`${user.displayName} · ${roleLabelVi(user.role)}`}
            >
              <Icon name="user" size={15} />
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Đăng xuất"
                title="Đăng xuất"
              >
                <Icon name="logout" size={16} />
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
              <Icon name="user" size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-tight text-zinc-900">
                {user.displayName}
              </span>
              <span className="block truncate text-[11px] leading-tight text-zinc-500">
                {roleLabelVi(user.role)}
              </span>
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Đăng xuất"
                title="Đăng xuất"
              >
                <Icon name="logout" size={16} />
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );

  return (
    // Column, not row: below lg the mobile top bar is an IN-FLOW child —
    // in a row flex it would render as a narrow left column and squeeze
    // the page content. At ≥lg the only in-flow child is the content
    // wrapper (sidebar is fixed), so the direction is irrelevant there.
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50">
      {/* Desktop sidebar (hidden in print: fixed elements repeat on every
          printed page) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-zinc-200 bg-white px-3 py-4 transition-[width] duration-200 print:hidden lg:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {renderNav(collapsed, true)}
      </aside>

      {/* Mobile drawer — always full labels */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[2px] print:hidden lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white px-3 py-4 transition-transform duration-200 print:hidden lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Điều hướng chính"
        aria-hidden={!open}
      >
        {renderNav(false, false)}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-zinc-200 bg-white/95 pr-4 backdrop-blur print:hidden lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100"
          aria-label="Mở menu"
        >
          <Icon name="menu" size={20} />
        </button>
        <h1 className="truncate text-sm font-semibold text-zinc-900">{page}</h1>
      </header>

      {/* Content (offset by sidebar on ≥lg; tracks the collapsed width).
          Block, NOT flex: page roots like `mx-auto max-w-7xl` are direct
          children — as flex items their auto cross margins (mx-auto) would
          disable stretch and let wide content (min-w tables) size them past
          the viewport (704px on a 390px phone). Block children always fill
          the containing block width. */}
      <div
        className={`min-w-0 flex-1 transition-[padding] duration-200 ${
          collapsed ? "lg:pl-16" : "lg:pl-60"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

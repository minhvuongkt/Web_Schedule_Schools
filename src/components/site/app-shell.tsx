"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { logoutAction } from "@/app/dang-nhap/actions";
import { roleLabelVi } from "@/components/leadership/labels";
import { Icon, type IconName } from "@/components/ui/icon";
import { can, type Permission, type Role } from "@/server/domain/roles";

/**
 * Sidebar-first app chrome for every internal page (everything except the
 * public landing / student surfaces). Replaces the old top navbar, whose
 * items overflowed and obscured text on narrow screens.
 *
 * - ≥lg: fixed left sidebar (w-60) — brand, grouped nav (RBAC-filtered),
 *   user chip + logout pinned at the bottom.
 * - <lg: sticky top bar (h-14) with a menu button; the sidebar becomes a
 *   slide-in drawer with a backdrop.
 *
 * Z-LADDER: drawer 50 > backdrop 40 > top bar 30 > page sticky bars 20.
 * Page-level sticky toolbars should use `top-14 lg:top-0`.
 */

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

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.teacherOnly && !user.teacherId) return false;
      if (item.permission && !can(user.role, item.permission)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);

  const nav = (
    <>
      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-zinc-100"
        onClick={() => setOpen(false)}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
          <Icon name="calendar" size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight text-zinc-900">
            Măng Cành
          </span>
          <span className="block text-[11px] leading-tight text-zinc-500">
            Thời khóa biểu điện tử
          </span>
        </span>
      </Link>

      <nav className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto" aria-label="Điều hướng chính">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
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
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-200 pt-3">
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
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-1 bg-zinc-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-zinc-200 bg-white px-3 py-4 lg:flex">
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white px-3 py-4 transition-transform duration-200 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Điều hướng chính"
        aria-hidden={!open}
      >
        {nav}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-zinc-200 bg-white/95 pr-4 backdrop-blur lg:hidden">
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

      {/* Content (offset by sidebar on ≥lg) */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">{children}</div>
    </div>
  );
}

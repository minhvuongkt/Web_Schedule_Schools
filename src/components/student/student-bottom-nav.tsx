"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";

/**
 * Bottom navigation for the student app (spec §10: Home / Timetable /
 * Notifications / Profile). Pinned to the viewport bottom on every screen
 * size — a page-end nav is invisible while scrolling, which made the app
 * hard to move around in.
 */
export function StudentBottomNav() {
  const pathname = usePathname();

  const items = [
    { href: "/hsv", label: "Trang chủ", icon: "home", active: pathname === "/hsv" },
    {
      href: "/hsv/thoi-khoa-bieu",
      label: "Thời khóa biểu",
      icon: "calendar",
      active: pathname.startsWith("/hsv/thoi-khoa-bieu"),
    },
    {
      href: "/hsv/thong-bao",
      label: "Thông báo",
      icon: "bell",
      active: pathname.startsWith("/hsv/thong-bao"),
    },
    { href: "/hsv/ho-so", label: "Hồ sơ", icon: "user", active: pathname.startsWith("/hsv/ho-so") },
  ] as const;

  return (
    <nav
      aria-label="Điều hướng chính"
      className="sticky bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-3xl pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition duration-200 active:scale-95 ${
                item.active
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              }`}
            >
              <Icon
                name={item.icon}
                size={22}
                className={`transition-transform duration-200 ${
                  item.active ? "scale-110" : ""
                }`}
              />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

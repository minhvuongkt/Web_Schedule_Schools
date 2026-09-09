"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";

/**
 * Bottom navigation for the student app (spec §10: Home / Timetable /
 * Notifications / Profile). Sticky on mobile, top-row on desktop.
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
      className="sticky bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur md:relative md:bottom-auto md:mt-8 md:border-t-0"
    >
      <ul className="mx-auto flex max-w-3xl">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                item.active ? "text-blue-700" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Icon name={item.icon} size={22} />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

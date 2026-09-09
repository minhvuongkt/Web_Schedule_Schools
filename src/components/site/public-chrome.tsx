import Link from "next/link";
import { Icon } from "@/components/ui/icon";

/**
 * Shared site chrome for public pages (timetable, student handbook, QR
 * deep-links). Carries the landing page's warm paper-and-green school
 * identity so the whole public surface feels like one product.
 */

export function PublicHeader({ current }: { current?: "tkb" | "hsv" | "login" }) {
  const navItem = (
    href: string,
    label: string,
    active: boolean,
  ) => (
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
          {current === "login" ? null : (
            <Link
              href="/dang-nhap"
              className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-emerald-800 active:scale-95"
            >
              <Icon name="login" size={14} />
              <span className="hidden sm:inline">Đăng nhập</span>
            </Link>
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

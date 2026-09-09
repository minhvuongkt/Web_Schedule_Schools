import Link from "next/link";
import type { ComponentProps } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Shared link component replacing bare blue underlined anchors.
 * - nav:     in-header / in-page navigation (quiet pill, icon-friendly)
 * - back:    subpage back links (auto arrow-left prefix)
 * - subtle:  inline links inside sentences — underline stays (prose affordance)
 * - muted:   tertiary links (e.g. "Trang chủ")
 * - danger:  destructive inline links (rare)
 *
 * No directive on this file: it compiles in both server and client trees
 * (only next/link + Icon — no server-only APIs).
 */

export type UiLinkVariant = "nav" | "back" | "subtle" | "muted" | "danger";

const BASE = "inline-flex items-center gap-1.5 text-sm font-medium transition-colors";

const VARIANTS: Record<UiLinkVariant, string> = {
  nav: "rounded-lg px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  back: "-ml-2 rounded-lg px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  subtle:
    "text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 hover:decoration-blue-500",
  muted: "text-zinc-500 hover:text-zinc-800",
  danger:
    "text-red-700 underline decoration-red-300 underline-offset-2 hover:text-red-900 hover:decoration-red-500",
};

interface UiLinkProps extends ComponentProps<typeof Link> {
  variant?: UiLinkVariant;
  icon?: IconName;
}

export function UiLink({
  variant = "subtle",
  icon,
  className,
  children,
  ...props
}: UiLinkProps) {
  return (
    <Link
      className={`${BASE} ${VARIANTS[variant]} ${className ?? ""}`}
      {...props}
    >
      {variant === "back" ? (
        <Icon name="arrow-left" size={16} />
      ) : icon ? (
        <Icon name={icon} size={15} />
      ) : null}
      {children}
    </Link>
  );
}

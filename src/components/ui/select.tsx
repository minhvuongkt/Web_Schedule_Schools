import type { ComponentProps, ReactNode } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * Shared styled select — site-wide replacement for bare native `<select>`
 * boxes. Custom chevron, consistent height/padding/focus ring, optional
 * visible or screen-reader-only label. No directive: compiles in both
 * server and client trees.
 */

const SIZE_CLASSES = {
  sm: "h-8 pl-2.5 pr-7 text-xs",
  md: "h-9 pl-3 pr-8 text-sm",
} as const;

export function Select({
  label,
  labelVisible = false,
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<"select">, "children" | "size"> & {
  label?: string;
  labelVisible?: boolean;
  size?: keyof typeof SIZE_CLASSES;
  children: ReactNode;
}) {
  const select = (
    <span className={`relative inline-flex ${labelVisible ? "block" : ""} ${className ?? ""}`}>
      <select
        aria-label={label}
        className={`w-full appearance-none rounded-lg border border-zinc-300 bg-white font-medium text-zinc-800 transition-colors hover:border-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:bg-zinc-50 disabled:text-zinc-400 ${SIZE_CLASSES[size]}`}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
      />
    </span>
  );

  if (!label) return select;
  if (labelVisible) {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
        {select}
      </label>
    );
  }
  return select;
}

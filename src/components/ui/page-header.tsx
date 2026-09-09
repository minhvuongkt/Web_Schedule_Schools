import type { ReactNode } from "react";

import { UiLink } from "@/components/ui/link";

/**
 * Shared page header with a "back" link (UiLink back variant — arrow icon
 * included). Used across subpages so every page has a consistent way back
 * to its parent section.
 */

export function PageHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <UiLink variant="back" href={backHref}>
        {backLabel}
      </UiLink>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

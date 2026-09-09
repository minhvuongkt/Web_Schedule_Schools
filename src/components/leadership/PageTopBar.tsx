import { logoutAction } from "@/app/dang-nhap/actions";
import { roleLabelVi, SCHOOL_NAME_VI } from "./labels";

interface PageTopBarProps {
  displayName: string;
  role: string;
}

export function PageTopBar({ displayName, role }: PageTopBarProps) {
  return (
    <header className="no-print sticky top-0 z-10 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
            {SCHOOL_NAME_VI}
          </p>
          <p className="truncate text-sm font-semibold text-zinc-900">
            {displayName}
            <span className="font-normal text-zinc-500">
              {" "}
              · {roleLabelVi(role)}
            </span>
          </p>
        </div>
        <form action={logoutAction} className="shrink-0">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            Đăng xuất
          </button>
        </form>
      </div>
    </header>
  );
}

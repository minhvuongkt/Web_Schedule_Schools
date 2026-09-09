import Link from "next/link";

import { formatWeekLabel } from "@/components/timetable/format";
import type { WeekOptionDto } from "./api";

interface WeekSelectorProps {
  weeks: WeekOptionDto[];
  selectedWeekId: string | null;
}

export function WeekSelector({ weeks, selectedWeekId }: WeekSelectorProps) {
  if (weeks.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Chọn tuần" className="mb-6 flex flex-wrap gap-1.5">
      {weeks.map((week) => {
        const selected = week.id === selectedWeekId;
        return (
          <Link
            key={week.id}
            href={`/bg?weekId=${encodeURIComponent(week.id)}`}
            aria-current={selected ? "page" : undefined}
            title={week.hasPublished ? "Tuần đã có phiên bản công bố" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selected
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
            }`}
          >
            {week.hasPublished ? (
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
            ) : null}
            {formatWeekLabel(week.weekNo, week.weekStart, week.weekEnd)}
          </Link>
        );
      })}
    </nav>
  );
}

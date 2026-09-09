"use client";

import { useMemo, useState } from "react";
import type { GridEntry } from "./api";

/**
 * Compact workload signal for the selected class in the current version:
 * scheduled lessons vs. the class's total, plus per-teacher concentration —
 * all derived from the loaded grid (no client-side authority; the validate
 * endpoint remains the source of truth for warnings).
 */
export function WorkloadBadge({
  entries,
  classId,
  editable,
}: {
  entries: GridEntry[];
  classId: string;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => {
    const mine = entries.filter((e) => e.classId === classId);
    const byTeacher = new Map<string, number>();
    for (const e of mine) {
      byTeacher.set(e.teacherId, (byTeacher.get(e.teacherId) ?? 0) + 1);
    }
    return {
      total: mine.length,
      teachers: [...byTeacher.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [entries, classId]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          editable
            ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            : "bg-zinc-50 text-zinc-400"
        }`}
        title="Số tiết của lớp trong phiên bản này"
      >
        {stats.total} tiết
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-10 w-56 rounded-md border border-zinc-200 bg-white p-2 shadow-md">
          <p className="mb-1 text-xs font-medium text-zinc-500">
            Giáo viên của lớp ({stats.teachers.length})
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs">
            {stats.teachers.map(([teacherId, count]) => (
              <li key={teacherId} className="flex justify-between text-zinc-700">
                <span className="truncate">{teacherId.slice(0, 12)}…</span>
                <span className="tabular-nums">{count} tiết</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

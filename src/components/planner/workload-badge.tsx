"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GridEntry, TeacherRef } from "./api";
import { Portal } from "@/components/ui/portal";

/**
 * Compact workload signal for the selected class in the current version:
 * scheduled lessons vs. the class's total, plus per-teacher concentration —
 * all derived from the loaded grid (no client-side authority; the validate
 * endpoint remains the source of truth for warnings).
 *
 * The detail popover is PORTAL-rendered with fixed coordinates: the sticky
 * toolbar card scrolls internally (bounded height), which would clip any
 * in-card absolute dropdown. Closes on outside click and Escape.
 */
export function WorkloadBadge({
  entries,
  classId,
  editable,
  teachers,
}: {
  entries: GridEntry[];
  classId: string;
  editable: boolean;
  teachers: TeacherRef[];
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  const teacherById = useMemo(
    () => new Map(teachers.map((t) => [t.id, t])),
    [teachers],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setAnchor({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpen(!open);
  }

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className={`min-h-8 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          editable
            ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            : "bg-zinc-50 text-zinc-400"
        }`}
        title="Số tiết của lớp trong phiên bản này"
      >
        {stats.total} tiết
      </button>
      {open && anchor ? (
        <Portal>
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Giáo viên của lớp"
            className="no-print fixed z-[60] w-56 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg"
            style={{ top: anchor.top, right: anchor.right }}
          >
            <p className="mb-1 text-xs font-medium text-zinc-500">
              Giáo viên của lớp ({stats.teachers.length})
            </p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto overscroll-contain text-xs">
              {stats.teachers.map(([teacherId, count]) => (
                <li key={teacherId} className="flex justify-between text-zinc-700">
                  <span className="truncate">
                    {teacherById.get(teacherId)?.shortName ??
                      teacherById.get(teacherId)?.fullName ??
                      "?"}
                  </span>
                  <span className="tabular-nums">{count} tiết</span>
                </li>
              ))}
            </ul>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}

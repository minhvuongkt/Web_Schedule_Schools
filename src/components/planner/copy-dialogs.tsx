"use client";

import { useState, type ReactNode } from "react";

import type { ClassRef } from "./api";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

const VI_DAY = (dow: number) => (dow === 7 ? "Chủ nhật" : `Thứ ${dow + 1}`);
const VI_DATE = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

interface DayRef {
  id: string;
  dayOfWeek: number;
  date: string;
}

function DialogShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {children}
        {footer}
      </div>
    </Modal>
  );
}

/**
 * Copy-day dialog: duplicates every lesson of the viewed class from one
 * school day to another (same periods) inside the current DRAFT version.
 * Occupied target cells are skipped by the server and reported in a toast.
 */
export function CopyDayDialog({
  busy,
  schoolDays,
  entryCountByDay,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  schoolDays: DayRef[];
  entryCountByDay: Map<string, number>;
  onConfirm: (sourceDayId: string, targetDayId: string) => void;
  onClose: () => void;
}) {
  const [sourceDayId, setSourceDayId] = useState(schoolDays[0]?.id ?? "");
  const [targetDayId, setTargetDayId] = useState(schoolDays[1]?.id ?? "");

  const sourceCount = sourceDayId ? entryCountByDay.get(sourceDayId) ?? 0 : 0;
  const sameDay = sourceDayId === targetDayId;
  const invalid = sameDay || sourceCount === 0 || !sourceDayId || !targetDayId;

  return (
    <DialogShell
      title="Sao chép ngày"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy || invalid}
            onClick={() => onConfirm(sourceDayId, targetDayId)}
            className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95 disabled:opacity-50"
          >
            Sao chép
          </button>
        </div>
      }
    >
      <Select
        label="Ngày nguồn"
        labelVisible
        value={sourceDayId}
        onChange={(e) => setSourceDayId(e.target.value)}
      >
        {schoolDays.map((day) => (
          <option key={day.id} value={day.id}>
            {VI_DAY(day.dayOfWeek)} · {VI_DATE(day.date)} —{" "}
            {entryCountByDay.get(day.id) ?? 0} tiết
          </option>
        ))}
      </Select>
      <Select
        label="Ngày đích"
        labelVisible
        value={targetDayId}
        onChange={(e) => setTargetDayId(e.target.value)}
      >
        {schoolDays.map((day) => (
          <option key={day.id} value={day.id}>
            {VI_DAY(day.dayOfWeek)} · {VI_DATE(day.date)} —{" "}
            {entryCountByDay.get(day.id) ?? 0} tiết
          </option>
        ))}
      </Select>
      <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600">
        {sameDay ? (
          "Chọn hai ngày khác nhau."
        ) : sourceCount === 0 ? (
          "Ngày nguồn không có tiết học nào của lớp này."
        ) : (
          <>
            Sẽ sao chép <strong>{sourceCount} tiết</strong> giữ nguyên tiết
            và giáo viên. Ô đích đã có tiết sẽ được bỏ qua (báo trong thông
            báo sau khi chép).
          </>
        )}
      </p>
    </DialogShell>
  );
}

/**
 * Copy-class dialog: duplicates a whole class schedule onto another class
 * (same days/periods) inside the current DRAFT version. Existing target
 * lessons block their cells — the server skips them.
 */
export function CopyClassDialog({
  busy,
  classes,
  sourceClassId,
  entryCountByClass,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  classes: ClassRef[];
  sourceClassId: string;
  entryCountByClass: Map<string, number>;
  onConfirm: (sourceClassId: string, targetClassId: string) => void;
  onClose: () => void;
}) {
  const [sourceId, setSourceId] = useState(sourceClassId || classes[0]?.id || "");
  const [targetId, setTargetId] = useState(
    classes.find((c) => c.id !== (sourceClassId || classes[0]?.id))?.id || "",
  );

  const sourceCount = sourceId ? entryCountByClass.get(sourceId) ?? 0 : 0;
  const targetCount = targetId ? entryCountByClass.get(targetId) ?? 0 : 0;
  const sameClass = sourceId === targetId;
  const invalid = sameClass || sourceCount === 0 || !sourceId || !targetId;

  return (
    <DialogShell
      title="Sao chép lịch lớp"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy || invalid}
            onClick={() => onConfirm(sourceId, targetId)}
            className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95 disabled:opacity-50"
          >
            Sao chép
          </button>
        </div>
      }
    >
      <Select
        label="Lớp nguồn"
        labelVisible
        value={sourceId}
        onChange={(e) => setSourceId(e.target.value)}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {entryCountByClass.get(c.id) ?? 0} tiết
          </option>
        ))}
      </Select>
      <Select
        label="Lớp đích"
        labelVisible
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {entryCountByClass.get(c.id) ?? 0} tiết
          </option>
        ))}
      </Select>
      <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600">
        {sameClass ? (
          "Chọn hai lớp khác nhau."
        ) : sourceCount === 0 ? (
          "Lớp nguồn không có tiết học nào để sao chép."
        ) : (
          <>
            Sẽ sao chép <strong>{sourceCount} tiết</strong> của lớp nguồn
            sang lớp đích, giữ nguyên môn, giáo viên và phòng học
            {targetCount > 0 ? (
              <>
                . <strong className="text-amber-700">
                  Lớp đích đã có {targetCount} tiết
                </strong>{" "}
                — những ô đã có tiết sẽ bị bỏ qua, KHÔNG bị ghi đè.
              </>
            ) : (
              ". Ô trùng lịch (nếu có) sẽ bỏ qua."
            )}
          </>
        )}
      </p>
    </DialogShell>
  );
}

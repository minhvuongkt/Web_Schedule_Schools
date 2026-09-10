"use client";

import { useState } from "react";
import type {
  ClassRef,
  GridEntry,
  RoomRef,
  SubjectRef,
  TeacherRef,
  VersionGrid,
} from "./api";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";

const VI_DAY = (dow: number) => (dow === 7 ? "Chủ nhật" : `Thứ ${dow + 1}`);
const VI_DATE = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

interface Props {
  entry: GridEntry | null;
  cell: { dayId: string; periodId: string } | null;
  grid: VersionGrid;
  classes: ClassRef[];
  teachers: TeacherRef[];
  subjects: SubjectRef[];
  rooms: RoomRef[];
  classFilter: string;
  editable: boolean;
  busy: boolean;
  onCreate: (payload: Omit<GridEntry, "id" | "status" | "notes"> & { notes?: string | null }) => void;
  onUpdate: (entry: GridEntry, patch: Partial<GridEntry>) => void;
  onDelete: (entry: GridEntry) => void;
  /** Pick up this lesson for pasting elsewhere (copy clipboard). */
  onCopy?: (entry: GridEntry) => void;
  onClose: () => void;
}

interface FormState {
  academicDayId: string;
  periodId: string;
  classId: string;
  subjectId: string;
  subjectComponentId: string;
  teacherId: string;
  roomId: string;
  notes: string;
}

export function EntryPanel({
  entry,
  cell,
  grid,
  classes,
  teachers,
  subjects,
  rooms,
  classFilter,
  editable,
  busy,
  onCreate,
  onUpdate,
  onDelete,
  onCopy,
  onClose,
}: Props) {
  const day = grid.days.find((d) => d.id === (cell?.dayId ?? entry?.academicDayId));
  const period = grid.periods.find((p) => p.id === (cell?.periodId ?? entry?.periodId));
  // Entries only exist on school days — the picker must not offer holidays.
  const schoolDays = grid.days.filter((d) => d.isSchoolDay);

  const [form, setForm] = useState<FormState>({
    academicDayId: day?.id ?? schoolDays[0]?.id ?? grid.days[0]?.id ?? "",
    periodId: period?.id ?? grid.periods[0]?.id ?? "",
    classId: entry?.classId ?? classFilter,
    subjectId: entry?.subjectId ?? subjects[0]?.id ?? "",
    subjectComponentId: entry?.subjectComponentId ?? "",
    teacherId: entry?.teacherId ?? teachers[0]?.id ?? "",
    roomId: entry?.roomId ?? "",
    notes: entry?.notes ?? "",
  });
  const [validation, setValidation] = useState<string | null>(null);

  const subject = subjects.find((s) => s.id === form.subjectId);

  const submit = () => {
    if (!form.subjectId || !form.teacherId || !form.classId) {
      setValidation("Vui lòng chọn đủ môn học, giáo viên và lớp.");
      return;
    }
    setValidation(null);
    const payload = {
      academicDayId: form.academicDayId,
      periodId: form.periodId,
      classId: form.classId,
      subjectId: form.subjectId,
      subjectComponentId: form.subjectComponentId || null,
      teacherId: form.teacherId,
      roomId: form.roomId || null,
      notes: form.notes || null,
    };
    if (entry) {
      onUpdate(entry, payload);
    } else {
      onCreate(payload);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          {entry ? "Sửa tiết học" : "Thêm tiết học"}
          {day && period && (
            <span className="mt-0.5 block text-xs font-normal text-zinc-500">
              {VI_DAY(day.dayOfWeek)} {VI_DATE(day.date)} · Tiết {period.orderNo} (
              {period.startTime})
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Đóng"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {validation && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {validation}
        </p>
      )}

      <div className="space-y-3 text-sm">
        <Select
          label="Thứ"
          labelVisible
          value={form.academicDayId}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, academicDayId: e.target.value })}
        >
          {schoolDays.map((d) => (
            <option key={d.id} value={d.id}>
              {VI_DAY(d.dayOfWeek)} · {VI_DATE(d.date)}
            </option>
          ))}
        </Select>

        <Select
          label="Tiết"
          labelVisible
          value={form.periodId}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, periodId: e.target.value })}
        >
          {grid.sessions.map((session) => (
            <optgroup key={session.id} label={session.labelVi}>
              {grid.periods
                .filter((p) => p.sessionId === session.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    Tiết {p.orderNo} · {p.startTime}
                    {p.endTime ? `–${p.endTime}` : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>

        <Select
          label="Lớp"
          labelVisible
          value={form.classId}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, classId: e.target.value })}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </Select>

        <div>
          <Select
            label="Môn học"
            labelVisible
            value={form.subjectId}
            disabled={!editable}
            onChange={(e) =>
              setForm({ ...form, subjectId: e.target.value, subjectComponentId: "" })
            }
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          {subject && subject.components.length > 0 && (
            <div className="mt-2">
              <Select
                label="Phân môn"
                labelVisible
                value={form.subjectComponentId}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, subjectComponentId: e.target.value })}
              >
                <option value="">— Không có phân môn —</option>
                {subject.components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <Select
          label="Giáo viên"
          labelVisible
          value={form.teacherId}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
        >
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName} ({t.code})
            </option>
          ))}
        </Select>

        <Select
          label="Phòng học"
          labelVisible
          value={form.roomId}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, roomId: e.target.value })}
        >
          <option value="">— Không gán phòng —</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code}
              {r.capacity ? ` (${r.capacity} chỗ)` : ""}
            </option>
          ))}
        </Select>

        <div>
          <label className="block text-xs font-medium text-zinc-500">Ghi chú</label>
          <input
            type="text"
            value={form.notes}
            disabled={!editable}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:bg-zinc-50"
          />
        </div>
      </div>

      {editable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {entry ? "Cập nhật" : "Thêm tiết học"}
          </button>
          {entry && onCopy && (
            <button
              type="button"
              onClick={() => onCopy(entry)}
              disabled={busy}
              title="Sao chép tiết này để dán vào ô trống khác"
              className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
            >
              Sao chép
            </button>
          )}
          {entry && (
            <button
              type="button"
              onClick={() => onDelete(entry)}
              disabled={busy}
              className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Xóa tiết
            </button>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          Phiên bản không chỉnh sửa được.
        </p>
      )}
    </div>
  );
}

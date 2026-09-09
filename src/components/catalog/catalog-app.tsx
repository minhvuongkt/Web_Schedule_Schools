"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/site/app-shell";
import { Icon } from "@/components/ui/icon";
import { Portal } from "@/components/ui/portal";
import { Select } from "@/components/ui/select";
import { useScrollLock } from "@/components/ui/use-scroll-lock";
import type { Role } from "@/server/domain/roles";

/**
 * Catalog management (/admin/danh-muc): teachers, subjects (+ components)
 * and rooms. All writes go through the catalog API with audit logging;
 * teachers toggle isActive (soft delete), subjects/rooms are never deleted
 * because entries and assignments reference them.
 */

interface TeacherRow {
  id: string;
  code: string;
  fullName: string;
  shortName: string | null;
  specialty: string | null;
  position: string | null;
  isActive: boolean;
  hasAccount: boolean;
  entryCount: number;
}

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  components: { id: string; code: string; name: string }[];
  entryCount: number;
}

interface RoomRow {
  id: string;
  code: string;
  name: string | null;
  roomType: string | null;
  capacity: number | null;
  entryCount: number;
}

type Tab = "teachers" | "subjects" | "rooms";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "teachers", label: "Giáo viên", icon: "user" },
  { key: "subjects", label: "Môn học", icon: "book-open" },
  { key: "rooms", label: "Phòng học", icon: "home" },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & T;
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Lỗi HTTP ${response.status}`);
  }
  return body;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        className="no-print fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="max-h-[90vh] w-full max-w-lg animate-scale-in overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Đóng"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";
const labelClass = "mb-1 block text-xs font-medium text-zinc-600";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

const POSITION_OPTIONS = ["GV", "Hiệu trưởng", "P.Hiệu trưởng", "Tổ trưởng", "Tổ phó"];

export function CatalogApp({ user }: { user: { displayName: string; role: Role } }) {
  const [tab, setTab] = useState<Tab>("teachers");
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [teacherModal, setTeacherModal] = useState<
    { mode: "create" } | { mode: "edit"; row: TeacherRow } | null
  >(null);
  const [subjectModal, setSubjectModal] = useState<
    { mode: "create" } | { mode: "edit"; row: SubjectRow } | null
  >(null);
  const [componentModal, setComponentModal] = useState<{
    subject: SubjectRow;
    component?: SubjectRow["components"][number];
  } | null>(null);
  const [roomModal, setRoomModal] = useState<
    { mode: "create" } | { mode: "edit"; row: RoomRow } | null
  >(null);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [t, s, r] = await Promise.all([
        api<{ teachers: TeacherRow[] }>("/api/teachers?catalog=true"),
        api<{ subjects: SubjectRow[] }>("/api/subjects?catalog=true"),
        api<{ rooms: RoomRow[] }>("/api/rooms?catalog=true"),
      ]);
      setTeachers(t.teachers);
      setSubjects(s.subjects);
      setRooms(r.rooms);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh mục.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [t, s, r] = await Promise.all([
          api<{ teachers: TeacherRow[] }>("/api/teachers?catalog=true"),
          api<{ subjects: SubjectRow[] }>("/api/subjects?catalog=true"),
          api<{ rooms: RoomRow[] }>("/api/rooms?catalog=true"),
        ]);
        if (cancelled) return;
        setTeachers(t.teachers);
        setSubjects(s.subjects);
        setRooms(r.rooms);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Không tải được danh mục.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<void>, successMessage: string) {
    setSaving(true);
    setError(null);
    try {
      await action();
      flash(successMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell page="Danh mục trường học" user={user}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Danh mục trường học
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Sửa thông tin giáo viên, môn học và phòng học của trường.
          </p>
        </header>
        {error ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-zinc-950/5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  tab === t.key
                    ? "bg-blue-700 text-white shadow"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              tab === "teachers"
                ? setTeacherModal({ mode: "create" })
                : tab === "subjects"
                  ? setSubjectModal({ mode: "create" })
                  : setRoomModal({ mode: "create" })
            }
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-blue-800 active:scale-95"
          >
            <Icon name="plus" size={15} />
            {tab === "teachers" ? "Thêm giáo viên" : tab === "subjects" ? "Thêm môn học" : "Thêm phòng học"}
          </button>
        </div>

        {loading ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            Đang tải…
          </p>
        ) : tab === "teachers" ? (
          <TeachersTable
            rows={teachers}
            onEdit={(row) => setTeacherModal({ mode: "edit", row })}
            onToggle={(row) =>
              run(async () => {
                await api(`/api/teachers/${row.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ isActive: !row.isActive }),
                });
                await loadAll();
              }, row.isActive ? "Đã ngừng hoạt động giáo viên." : "Đã kích hoạt lại giáo viên.")
            }
          />
        ) : tab === "subjects" ? (
          <SubjectsTable
            rows={subjects}
            onEdit={(row) => setSubjectModal({ mode: "edit", row })}
            onAddComponent={(subject) => setComponentModal({ subject })}
            onEditComponent={(subject, component) =>
              setComponentModal({ subject, component })
            }
          />
        ) : (
          <RoomsTable
            rows={rooms}
            onEdit={(row) => setRoomModal({ mode: "edit", row })}
          />
        )}

        <p className="mt-6 text-xs text-zinc-400">
          Danh mục không cho phép xóa: lịch sử thời khóa biểu, phân công và nhật
          ký hệ thống tham chiếu đến các bản ghi này. Giáo viên nghỉ dạy hãy
          chuyển sang trạng thái ngừng hoạt động.
        </p>
      </div>

      {teacherModal ? (
        <TeacherModal
          initial={teacherModal.mode === "edit" ? teacherModal.row : null}
          saving={saving}
          onClose={() => setTeacherModal(null)}
          onSubmit={(data) =>
            run(async () => {
              if (teacherModal.mode === "edit") {
                await api(`/api/teachers/${teacherModal.row.id}`, {
                  method: "PATCH",
                  body: JSON.stringify(data),
                });
              } else {
                await api("/api/teachers", {
                  method: "POST",
                  body: JSON.stringify(data),
                });
              }
              setTeacherModal(null);
              await loadAll();
            }, "Đã lưu thông tin giáo viên.")
          }
        />
      ) : null}

      {subjectModal ? (
        <SubjectModal
          initial={subjectModal.mode === "edit" ? subjectModal.row : null}
          saving={saving}
          onClose={() => setSubjectModal(null)}
          onSubmit={(data) =>
            run(async () => {
              if (subjectModal.mode === "edit") {
                await api(`/api/subjects/${subjectModal.row.id}`, {
                  method: "PATCH",
                  body: JSON.stringify(data),
                });
              } else {
                await api("/api/subjects", {
                  method: "POST",
                  body: JSON.stringify(data),
                });
              }
              setSubjectModal(null);
              await loadAll();
            }, "Đã lưu môn học.")
          }
        />
      ) : null}

      {componentModal ? (
        <ComponentModal
          subjectName={componentModal.subject.name}
          initial={componentModal.component ?? null}
          saving={saving}
          onClose={() => setComponentModal(null)}
          onSubmit={(data) =>
            run(async () => {
              if (componentModal.component) {
                await api(
                  `/api/subjects/components?id=${componentModal.component.id}`,
                  { method: "PATCH", body: JSON.stringify(data) },
                );
              } else {
                await api("/api/subjects/components", {
                  method: "POST",
                  body: JSON.stringify({
                    subjectId: componentModal.subject.id,
                    ...data,
                  }),
                });
              }
              setComponentModal(null);
              await loadAll();
            }, "Đã lưu phân môn.")
          }
        />
      ) : null}

      {roomModal ? (
        <RoomModal
          initial={roomModal.mode === "edit" ? roomModal.row : null}
          saving={saving}
          onClose={() => setRoomModal(null)}
          onSubmit={(data) =>
            run(async () => {
              if (roomModal.mode === "edit") {
                await api(`/api/rooms/${roomModal.row.id}`, {
                  method: "PATCH",
                  body: JSON.stringify(data),
                });
              } else {
                await api("/api/rooms", {
                  method: "POST",
                  body: JSON.stringify(data),
                });
              }
              setRoomModal(null);
              await loadAll();
            }, "Đã lưu phòng học.")
          }
        />
      ) : null}
    </AppShell>
  );
}

function TeachersTable({
  rows,
  onEdit,
  onToggle,
}: {
  rows: TeacherRow[];
  onEdit: (row: TeacherRow) => void;
  onToggle: (row: TeacherRow) => void;
}) {
  return (
    <>
      {/* Mobile: cards (actions stay visible without horizontal scroll) */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {row.fullName}
                  <span className="ml-1.5 font-mono text-xs font-semibold text-zinc-500">
                    {row.code}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {[row.position, row.specialty].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  row.isActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    row.isActive ? "bg-emerald-500" : "bg-zinc-400"
                  }`}
                />
                {row.isActive ? "Đang dạy" : "Nghỉ"}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onEdit(row)}
                className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-600 hover:text-blue-700 active:scale-95"
              >
                Sửa
              </button>
              <button
                type="button"
                onClick={() => onToggle(row)}
                className={`min-h-11 flex-1 rounded-lg border px-2.5 text-xs font-medium transition-colors active:scale-95 ${
                  row.isActive
                    ? "border-rose-200 text-rose-700 hover:border-rose-400"
                    : "border-emerald-200 text-emerald-700 hover:border-emerald-400"
                }`}
              >
                {row.isActive ? "Ngừng dạy" : "Kích hoạt"}
              </button>
            </div>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            Chưa có giáo viên nào.
          </li>
        ) : null}
      </ul>

      {/* ≥md: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm md:block [&>table]:min-w-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-400">
            <th className="px-4 py-3 font-medium">Mã</th>
            <th className="px-4 py-3 font-medium">Họ tên</th>
            <th className="px-4 py-3 font-medium">Chức danh</th>
            <th className="px-4 py-3 font-medium">Chuyên môn</th>
            <th className="px-4 py-3 font-medium">Trạng thái</th>
            <th className="px-4 py-3 text-right font-medium">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-zinc-500">
                {row.code}
              </td>
              <td className="px-4 py-3 font-medium text-zinc-900">
                {row.fullName}
                {row.shortName ? (
                  <span className="ml-1.5 text-xs text-zinc-400">({row.shortName})</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-zinc-600">{row.position ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-600">{row.specialty ?? "—"}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    row.isActive
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      row.isActive ? "bg-emerald-500" : "bg-zinc-400"
                    }`}
                  />
                  {row.isActive ? "Đang dạy" : "Nghỉ"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition duration-200 hover:border-blue-600 hover:text-blue-700 active:scale-95"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(row)}
                  className={`ml-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    row.isActive
                      ? "border-rose-200 text-rose-700 transition duration-200 hover:border-rose-400 active:scale-95"
                      : "border-emerald-200 text-emerald-700 transition duration-200 hover:border-emerald-400 active:scale-95"
                  }`}
                >
                  {row.isActive ? "Ngừng dạy" : "Kích hoạt"}
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                Chưa có giáo viên nào.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </>
  );
}

function SubjectsTable({
  rows,
  onEdit,
  onAddComponent,
  onEditComponent,
}: {
  rows: SubjectRow[];
  onEdit: (row: SubjectRow) => void;
  onAddComponent: (subject: SubjectRow) => void;
  onEditComponent: (subject: SubjectRow, component: SubjectRow["components"][number]) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <article
          key={row.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-zinc-900">{row.name}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {row.code}
                {row.category ? ` · ${row.category}` : ""} · {row.entryCount} tiết đã xếp
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEdit(row)}
              className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition duration-200 hover:border-blue-600 hover:text-blue-700 active:scale-95"
            >
              Sửa
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {row.components.length > 0 ? (
              row.components.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onEditComponent(row, c)}
                  className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100"
                  title="Sửa phân môn"
                >
                  {c.name}
                </button>
              ))
            ) : (
              <span className="text-xs text-zinc-400">Không có phân môn</span>
            )}
            <button
              type="button"
              onClick={() => onAddComponent(row)}
              className="rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:border-violet-400 hover:text-violet-700"
            >
              + Phân môn
            </button>
          </div>
        </article>
      ))}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 sm:col-span-2">
          Chưa có môn học nào.
        </p>
      ) : null}
    </div>
  );
}

function RoomsTable({
  rows,
  onEdit,
}: {
  rows: RoomRow[];
  onEdit: (row: RoomRow) => void;
}) {
  return (
    <>
      {/* Mobile: cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {row.name ?? row.code}
                  <span className="ml-1.5 font-mono text-xs font-semibold text-zinc-500">
                    {row.code}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {[row.roomType, row.capacity ? `${row.capacity} chỗ` : null, `${row.entryCount} tiết đã xếp`]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onEdit(row)}
              className="mt-3 min-h-11 w-full rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-600 hover:text-blue-700 active:scale-95"
            >
              Sửa
            </button>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            Chưa có phòng học nào.
          </li>
        ) : null}
      </ul>

      {/* ≥md: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm md:block [&>table]:min-w-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-400">
            <th className="px-4 py-3 font-medium">Mã phòng</th>
            <th className="px-4 py-3 font-medium">Tên phòng</th>
            <th className="px-4 py-3 font-medium">Loại</th>
            <th className="px-4 py-3 font-medium">Sức chứa</th>
            <th className="px-4 py-3 font-medium">Số tiết đã xếp</th>
            <th className="px-4 py-3 text-right font-medium">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-zinc-500">
                {row.code}
              </td>
              <td className="px-4 py-3 font-medium text-zinc-900">{row.name ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-600">{row.roomType ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-600">{row.capacity ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-600">{row.entryCount}</td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition duration-200 hover:border-blue-600 hover:text-blue-700 active:scale-95"
                >
                  Sửa
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                Chưa có phòng học nào.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </>
  );
}

function TeacherModal({
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  initial: TeacherRow | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: {
    code?: string;
    fullName: string;
    shortName: string | null;
    specialty: string | null;
    position: string | null;
  }) => void;
}) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      ...(initial ? {} : { code: String(form.get("code") ?? "") }),
      fullName: String(form.get("fullName") ?? ""),
      shortName: (form.get("shortName") as string) || null,
      specialty: (form.get("specialty") as string) || null,
      position: (form.get("position") as string) || null,
    });
  }

  return (
    <Modal
      title={initial ? `Sửa giáo viên ${initial.code}` : "Thêm giáo viên"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {initial ? null : (
          <Field label="Mã giáo viên (vd: T20)">
            <input name="code" required maxLength={20} className={inputClass} placeholder="T20" />
          </Field>
        )}
        <Field label="Họ và tên">
          <input
            name="fullName"
            required
            maxLength={120}
            defaultValue={initial?.fullName ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Tên viết tắt (không bắt buộc, vd: C.Vân)">
          <input
            name="shortName"
            maxLength={60}
            defaultValue={initial?.shortName ?? ""}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chức danh">
            <Select name="position" defaultValue={initial?.position ?? "GV"}>
              {POSITION_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chuyên môn (vd: ĐHSP Toán)">
            <input
              name="specialty"
              maxLength={120}
              defaultValue={initial?.specialty ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-500"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SubjectModal({
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  initial: SubjectRow | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: { code?: string; name: string; category: string | null }) => void;
}) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      ...(initial ? {} : { code: String(form.get("code") ?? "") }),
      name: String(form.get("name") ?? ""),
      category: (form.get("category") as string) || null,
    });
  }

  return (
    <Modal title={initial ? `Sửa môn ${initial.name}` : "Thêm môn học"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {initial ? null : (
          <Field label="Mã môn (chữ hoa, không dấu, vd: INFORMATICS)">
            <input
              name="code"
              required
              maxLength={40}
              className={inputClass}
              placeholder="TIN_HOC"
            />
          </Field>
        )}
        <Field label="Tên môn học">
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={initial?.name ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Nhóm môn (không bắt buộc, vd: Khoa học tự nhiên)">
          <input
            name="category"
            maxLength={120}
            defaultValue={initial?.category ?? ""}
            className={inputClass}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-500"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ComponentModal({
  subjectName,
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  subjectName: string;
  initial: { code: string; name: string } | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: { code?: string; name: string }) => void;
}) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      ...(initial ? {} : { code: String(form.get("code") ?? "") }),
      name: String(form.get("name") ?? ""),
    });
  }

  return (
    <Modal
      title={
        initial ? `Sửa phân môn "${initial.name}"` : `Thêm phân môn — ${subjectName}`
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {initial ? null : (
          <Field label="Mã phân môn (chữ hoa, không dấu, vd: PHYSICS)">
            <input name="code" required maxLength={40} className={inputClass} />
          </Field>
        )}
        <Field label="Tên phân môn (vd: Lý)">
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={initial?.name ?? ""}
            className={inputClass}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-500"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RoomModal({
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  initial: RoomRow | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: {
    code?: string;
    name: string | null;
    roomType: string | null;
    capacity: number | null;
  }) => void;
}) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const capacityRaw = String(form.get("capacity") ?? "");
    onSubmit({
      ...(initial ? {} : { code: String(form.get("code") ?? "") }),
      name: (form.get("name") as string) || null,
      roomType: (form.get("roomType") as string) || null,
      capacity: capacityRaw ? Number(capacityRaw) : null,
    });
  }

  return (
    <Modal title={initial ? `Sửa phòng ${initial.code}` : "Thêm phòng học"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {initial ? null : (
          <Field label="Mã phòng (vd: P201)">
            <input name="code" required maxLength={40} className={inputClass} placeholder="P201" />
          </Field>
        )}
        <Field label="Tên phòng (vd: Phòng Tin học)">
          <input
            name="name"
            maxLength={120}
            defaultValue={initial?.name ?? ""}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Loại phòng (không bắt buộc)">
            <input
              name="roomType"
              maxLength={60}
              defaultValue={initial?.roomType ?? ""}
              className={inputClass}
              placeholder="Phòng học / Phòng chức năng"
            />
          </Field>
          <Field label="Sức chứa (không bắt buộc)">
            <input
              name="capacity"
              type="number"
              min={1}
              max={500}
              defaultValue={initial?.capacity ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-500"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

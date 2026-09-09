"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface AssignmentRow {
  id: string;
  teacherId: string;
  classId: string | null;
  subjectId: string | null;
  subjectComponentId: string | null;
  lessonsPerWeek: number;
  assignmentType: string;
  notes: string | null;
  isActive: boolean;
  teacher: { code: string; fullName: string } | null;
  class: { code: string } | null;
  subject: { name: string } | null;
  subjectComponent: { name: string } | null;
}

interface TeacherRef {
  id: string;
  code: string;
  fullName: string;
  shortName: string;
}

interface ClassRef {
  id: string;
  code: string;
  grade: number;
}

interface SubjectRef {
  id: string;
  code: string;
  name: string;
  components: { id: string; code: string; name: string }[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  if (!res.ok) {
    const err = (body as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `Lỗi ${res.status}`);
  }
  return body as T;
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  if (!res.ok) {
    const err = (parsed as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `Lỗi ${res.status}`);
  }
  return parsed as T;
}

export function AssignmentsApp({ canManage }: { canManage: boolean }) {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRef[]>([]);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [teacherFilter, setTeacherFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, t, c, s] = await Promise.all([
        getJson<{ assignments: AssignmentRow[] }>("/api/assignments"),
        getJson<{ teachers: TeacherRef[] }>("/api/teachers"),
        getJson<{ classes: ClassRef[] }>("/api/classes"),
        getJson<{ subjects: SubjectRef[] }>("/api/subjects"),
      ]);
      setAssignments(a.assignments ?? []);
      setTeachers(t.teachers ?? []);
      setClasses(c.classes ?? []);
      setSubjects(s.subjects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được phân công.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) setError("Không tải được phân công.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const byTeacher = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const row of assignments) {
      if (teacherFilter && row.teacherId !== teacherFilter) continue;
      const list = map.get(row.teacherId);
      if (list) list.push(row);
      else map.set(row.teacherId, [row]);
    }
    return map;
  }, [assignments, teacherFilter]);

  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await load();
      setEditing(null);
      setCreating(false);
      setNotice(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5"
        >
          <option value="">Tất cả giáo viên ({teachers.length})</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName} ({t.code})
            </option>
          ))}
        </select>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
            disabled={busy}
            className="ml-auto rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Thêm phân công
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => setError(null)}>
            Đóng
          </button>
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
          <button type="button" className="ml-3 underline" onClick={() => setNotice(null)}>
            Đóng
          </button>
        </div>
      )}

      {creating && canManage && (
        <AssignmentForm
          teachers={teachers}
          classes={classes}
          subjects={subjects}
          busy={busy}
          onSubmit={(payload) =>
            run("Đã thêm phân công.", () => send("/api/assignments", "POST", payload))
          }
          onClose={() => setCreating(false)}
        />
      )}

      {editing && canManage && (
        <AssignmentForm
          initial={editing}
          teachers={teachers}
          classes={classes}
          subjects={subjects}
          busy={busy}
          onSubmit={(payload) =>
            run("Đã cập nhật phân công.", () => send(`/api/assignments/${editing.id}`, "PATCH", payload))
          }
          onDelete={() =>
            run("Đã gỡ phân công (lưu lịch sử).", () =>
              send(`/api/assignments/${editing.id}?reason=${encodeURIComponent("Gỡ khỏi năm học")}`, "DELETE"),
            )
          }
          onClose={() => setEditing(null)}
        />
      )}

      {[...byTeacher.entries()].map(([tid, rows]) => {
        const teacher = teacherById.get(tid);
        const teachingTotal = rows
          .filter((r) => r.assignmentType === "TEACHING")
          .reduce((sum, r) => sum + r.lessonsPerWeek, 0);
        const dutyTotal = rows
          .filter((r) => r.assignmentType !== "TEACHING")
          .reduce((sum, r) => sum + r.lessonsPerWeek, 0);
        return (
          <section key={tid} className="rounded-lg border border-zinc-200 bg-white">
            <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-zinc-900">
                {teacher?.fullName ?? rows[0].teacher?.fullName ?? tid}
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  {teacher?.code ?? rows[0].teacher?.code}
                </span>
              </h2>
              <span className="text-xs text-zinc-500">
                Dạy {teachingTotal} tiết · Kiêm nhiệm {dutyTotal}
              </span>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                  <th className="px-4 py-1.5 font-medium">Lớp</th>
                  <th className="px-4 py-1.5 font-medium">Môn (phân môn)</th>
                  <th className="px-4 py-1.5 font-medium">Loại</th>
                  <th className="px-4 py-1.5 font-medium">Tiết/tuần</th>
                  <th className="px-4 py-1.5 font-medium">Ghi chú</th>
                  {canManage && <th className="px-4 py-1.5 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-1.5">{row.class?.code ?? "—"}</td>
                    <td className="px-4 py-1.5">
                      {row.subject?.name ?? "—"}
                      {row.subjectComponent ? ` (${row.subjectComponent.name})` : ""}
                    </td>
                    <td className="px-4 py-1.5">
                      {row.assignmentType === "TEACHING" ? "Dạy học" : "Kiêm nhiệm"}
                    </td>
                    <td className="px-4 py-1.5 tabular-nums">{row.lessonsPerWeek}</td>
                    <td className="px-4 py-1.5 text-xs text-zinc-500">{row.notes ?? "—"}</td>
                    {canManage && (
                      <td className="px-4 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(row);
                            setCreating(false);
                          }}
                          className="text-xs text-blue-700 hover:underline"
                        >
                          Sửa
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {assignments.length === 0 && !error && (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
          Chưa có phân công nào.
        </p>
      )}
    </div>
  );
}

interface FormPayload {
  teacherId: string;
  classId: string | null;
  subjectId: string | null;
  subjectComponentId: string | null;
  lessonsPerWeek: number;
  assignmentType: "TEACHING" | "DUTY";
  notes: string | null;
}

function AssignmentForm({
  initial,
  teachers,
  classes,
  subjects,
  busy,
  onSubmit,
  onDelete,
  onClose,
}: {
  initial?: AssignmentRow;
  teachers: TeacherRef[];
  classes: ClassRef[];
  subjects: SubjectRef[];
  busy: boolean;
  onSubmit: (payload: FormPayload) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [teacherId, setTeacherId] = useState(initial?.teacherId ?? teachers[0]?.id ?? "");
  const [classId, setClassId] = useState(initial?.classId ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [componentId, setComponentId] = useState(initial?.subjectComponentId ?? "");
  const [lessons, setLessons] = useState(String(initial?.lessonsPerWeek ?? 4));
  const [type, setType] = useState<"TEACHING" | "DUTY">(
    (initial?.assignmentType as "TEACHING" | "DUTY") ?? "TEACHING",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [validation, setValidation] = useState<string | null>(null);

  const subject = subjects.find((s) => s.id === subjectId);

  const submit = () => {
    const n = Number(lessons);
    if (!teacherId) {
      setValidation("Vui lòng chọn giáo viên.");
      return;
    }
    if (!Number.isInteger(n) || n < 0 || n > 50) {
      setValidation("Số tiết/tuần phải là số nguyên 0–50.");
      return;
    }
    if (type === "TEACHING" && (!classId || !subjectId)) {
      setValidation("Phân công dạy học cần lớp và môn học.");
      return;
    }
    setValidation(null);
    onSubmit({
      teacherId,
      classId: classId || null,
      subjectId: subjectId || null,
      subjectComponentId: componentId || null,
      lessonsPerWeek: n,
      assignmentType: type,
      notes: notes || null,
    });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          {initial ? "Sửa phân công" : "Thêm phân công"}
        </h3>
        <button type="button" onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-600">
          Đóng
        </button>
      </div>
      {validation && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {validation}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Giáo viên</label>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Loại</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "TEACHING" | "DUTY")}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
          >
            <option value="TEACHING">Dạy học</option>
            <option value="DUTY">Kiêm nhiệm</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Lớp</label>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
          >
            <option value="">— (không có) —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Môn học</label>
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setComponentId("");
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
          >
            <option value="">— (không có) —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {subject && subject.components.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-zinc-500">Phân môn</label>
            <select
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
            >
              <option value="">— Không —</option>
              {subject.components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-zinc-500">Tiết/tuần</label>
          <input
            type="number"
            min={0}
            max={50}
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-zinc-500">Ghi chú</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {initial ? "Cập nhật" : "Thêm"}
        </button>
        {onDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Gỡ phân công
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { Toast } from "@/components/ui/toast";
import { useScrollLock } from "@/components/ui/use-scroll-lock";

// ---------------------------------------------------------------------------
// Typed API client for live-ops (kept local; mirrors the planner contract)
// ---------------------------------------------------------------------------

interface ApiEnvelope {
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  if (!res.ok) {
    const err = (parsed as ApiEnvelope).error;
    throw new Error(err?.message ?? `Lỗi ${res.status}`);
  }
  return parsed as T;
}

interface LiveEntry {
  id: string;
  academicDayId: string;
  periodId: string;
  classId: string;
  teacherId: string;
  subjectId: string;
  subjectComponentId: string | null;
  roomId: string | null;
  status: string;
}

interface LiveGrid {
  version: { id: string; weekNo: number; versionNo: number; status: string; revision: number };
  days: { id: string; date: string; dayOfWeek: number; isSchoolDay: boolean }[];
  sessions: { id: string; code: string; labelVi: string; orderNo: number }[];
  periods: { id: string; sessionId: string; orderNo: number; startTime: string; endTime: string | null }[];
  entries: LiveEntry[];
}

interface ActiveSubstitution {
  id: string;
  status: string;
  reason: string | null;
  originalTeacherName: string;
  substituteTeacherName: string;
  entry: {
    id: string;
    status: string;
    subjectName: string;
    componentName: string | null;
    classCode: string;
    dayOfWeek: number;
    date: string;
    periodOrderNo: number;
    startTime: string;
  };
}

interface ActiveMakeup {
  id: string;
  status: string;
  reason: string | null;
  original: { id: string; subjectName: string; componentName: string | null; classCode: string };
  makeup: { id: string; dayOfWeek: number; date: string; periodOrderNo: number; startTime: string } | null;
}

// ---------------------------------------------------------------------------

const VI_DAY = (dow: number) => (dow === 7 ? "Chủ nhật" : `Thứ ${dow + 1}`);
const VI_DATE = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  NORMAL: { label: "", cls: "" },
  SUBSTITUTED: { label: "Đã thay", cls: "bg-amber-100 text-amber-900" },
  CANCELLED: { label: "Đã hủy", cls: "bg-zinc-200 text-zinc-600" },
  MAKEUP: { label: "Dạy bù", cls: "bg-blue-100 text-blue-800" },
  MOVED: { label: "Đã dời", cls: "bg-zinc-100 text-zinc-600" },
};

export function LiveOpsApp() {
  const [weeks, setWeeks] = useState<{ id: string; weekNo: number; weekStart: string; weekEnd: string }[]>([]);
  const [weekId, setWeekId] = useState("");
  const [grid, setGrid] = useState<LiveGrid | null>(null);
  const [classes, setClasses] = useState<{ id: string; code: string; grade: number }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; code: string; fullName: string; shortName: string }[]>([]);
  const [classId, setClassId] = useState("");
  const [subs, setSubs] = useState<ActiveSubstitution[]>([]);
  const [makeups, setMakeups] = useState<ActiveMakeup[]>([]);
  const [selected, setSelected] = useState<LiveEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const toastSeq = useRef(0);

  useScrollLock(Boolean(selected));

  const flashNotice = useCallback((message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setError(null);
    const id = ++toastSeq.current;
    setToast({ id, message });
    toastTimer.current = window.setTimeout(() => {
      setToast((current) => (current !== null && current.id === id ? null : current));
      toastTimer.current = null;
    }, 4000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  /** Error toasts auto-dismiss (8s) so they never permanently cover
      controls; manual close always available. */
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 8000);
    return () => window.clearTimeout(t);
  }, [error]);

  /** Esc closes the entry sheet (mirrors ConfirmDialog). */
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const loadActive = useCallback(async (wid: string) => {
    const res = await fetch(`/api/substitutions?weekId=${wid}`);
    if (!res.ok) return;
    const body = await res.json();
    setSubs(body.substitutions ?? []);
    setMakeups(body.makeups ?? []);
  }, []);

  const loadGridFor = useCallback(
    async (wid: string) => {
      const res = await fetch(`/api/timetable/versions?weekId=${wid}`);
      if (!res.ok) throw new Error("Không tải được phiên bản.");
      const body = await res.json();
      const published = (body.versions ?? []).find((v: { status: string }) => v.status === "PUBLISHED");
      if (!published) {
        setGrid(null);
        return;
      }
      const gridRes = await fetch(`/api/timetable/versions/${published.id}`);
      if (!gridRes.ok) throw new Error("Không tải được lưới.");
      setGrid(await gridRes.json());
      await loadActive(wid);
    },
    [loadActive],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [w, c, t] = await Promise.all([
          fetch("/api/weeks").then((r) => r.json()),
          fetch("/api/classes").then((r) => r.json()),
          fetch("/api/teachers").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setWeeks(w.weeks ?? []);
        setClasses(c.classes ?? []);
        setTeachers(t.teachers ?? []);
        if ((w.weeks ?? []).length > 0) {
          setWeekId(w.weeks[0].id);
          setClassId((c.classes ?? [])[0]?.id ?? "");
          await loadGridFor(w.weeks[0].id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được dữ liệu.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadGridFor]);

  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const entryByCell = new Map<string, LiveEntry>();
  for (const e of grid?.entries ?? []) {
    if (classId && e.classId !== classId) continue;
    entryByCell.set(`${e.academicDayId}|${e.periodId}`, e);
  }
  const schoolDays = (grid?.days ?? []).filter((d) => d.isSchoolDay);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadGridFor(weekId);
      setSelected(null);
      flashNotice(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-8 pt-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* left column: sticky filter bar + grid + active ops list.
            Toolbar lives inside the column so the rail sticks independently
            (top-14 clears the mobile top bar; ≥lg no top bar → top-0). */}
        <div className="min-w-0 flex-1">
          {/* Compact sticky toolbar (bounded height; chips scroll in one
              line <lg so the card never grows over the grid). */}
          <div className="no-print sticky top-14 z-20 mb-4 max-h-[calc(100vh-3.5rem)] space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm [@supports(height:100dvh)]:max-h-[calc(100dvh-3.5rem)] lg:top-0 lg:max-h-none lg:overflow-visible">
            <div className="flex items-center gap-2">
              <Select
                label="Chọn tuần"
                className="min-w-0 flex-1"
                value={weekId}
                onChange={(e) => {
                  setWeekId(e.target.value);
                  setGrid(null);
                  setSelected(null);
                  loadGridFor(e.target.value).catch((err) => setError(String(err)));
                }}
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    Tuần {String(w.weekNo).padStart(2, "0")} ({VI_DATE(w.weekStart)} – {VI_DATE(w.weekEnd)})
                  </option>
                ))}
              </Select>
              {grid && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                  Đã công bố · v{grid.version.versionNo}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 pr-1 text-xs font-medium text-zinc-500">Lớp</span>
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
                {classes.map((c) => {
                  const active = c.id === classId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setClassId(c.id);
                        setSelected(null);
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                      }`}
                    >
                      {c.code}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto [&_table]:min-w-2xl">
            {!grid ? (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                Tuần này chưa có phiên bản công bố.
              </div>
            ) : (
              <div className="space-y-4">
                {grid.sessions.map((session) => (
                  <section key={session.id}>
                    <h3 className="mb-1.5 text-sm font-semibold text-zinc-700">{session.labelVi}</h3>
                    <table className="w-full table-fixed border-collapse text-sm">
                      <thead>
                        <tr className="bg-zinc-50">
                          <th className="sticky left-0 z-10 w-28 border border-r-0 border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left text-xs font-medium text-zinc-500 shadow-[inset_-1px_0_0_#e4e4e7]">
                            Tiết
                          </th>
                          {schoolDays.map((day) => (
                            <th key={day.id} className="border border-zinc-200 px-2 py-1.5 text-center text-xs">
                              <span className="block font-semibold text-zinc-900">{VI_DAY(day.dayOfWeek)}</span>
                              <span className="block text-zinc-500">{VI_DATE(day.date)}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grid.periods
                          .filter((p) => p.sessionId === session.id)
                          .map((period) => (
                            <tr key={period.id}>
                              <th scope="row" className="sticky left-0 z-10 border border-r-0 border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left text-xs font-medium shadow-[inset_-1px_0_0_#e4e4e7]">
                                Tiết {period.orderNo}
                                <span className="block text-zinc-500">{period.startTime}</span>
                              </th>
                              {schoolDays.map((day) => {
                                const entry = entryByCell.get(`${day.id}|${period.id}`);
                                const badge = entry ? STATUS_BADGES[entry.status] : undefined;
                                const isSel = selected?.id === entry?.id;
                                return (
                                  <td
                                    key={day.id}
                                    onClick={() => entry && setSelected(entry)}
                                    className={`cursor-pointer border border-zinc-200 px-2 py-1.5 align-top ${
                                      isSel ? "bg-blue-50 ring-2 ring-blue-400" : entry ? "bg-white" : "bg-zinc-50/50"
                                    }`}
                                  >
                                    {entry ? (
                                      <div>
                                        <span className="block text-xs font-medium text-zinc-900">
                                          {teacherById.get(entry.teacherId)?.shortName ?? "?"}
                                          {badge?.label ? " · " : ""}
                                          {badge?.label ? (
                                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                                              {badge.label}
                                            </span>
                                          ) : null}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-zinc-300">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            )}
          </div>

          {(subs.length > 0 || makeups.length > 0) && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-zinc-900">Phân công đang áp dụng</h3>
              <ul className="space-y-2 text-xs">
                {subs.map((s) => (
                  <li key={s.id} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
                    <span className="block text-amber-900">
                      {s.entry.classCode} · {s.entry.subjectName}
                      {s.entry.componentName ? ` (${s.entry.componentName})` : ""} ·{" "}
                      {VI_DAY(s.entry.dayOfWeek)} Tiết {s.entry.periodOrderNo}
                    </span>
                    <span className="block text-amber-700">
                      {s.originalTeacherName} → <strong>{s.substituteTeacherName}</strong> ({s.status})
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run("Đã hủy phân công dạy thay.", () =>
                          post("/api/substitutions/cancel", { substitutionId: s.id }),
                        )
                      }
                      className="mt-1.5 inline-flex min-h-11 items-center rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:border-red-400 hover:bg-red-50 disabled:opacity-50"
                    >
                      Hủy phân công
                    </button>
                  </li>
                ))}
                {makeups.map((m) => (
                  <li key={m.id} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5">
                    <span className="block text-blue-900">
                      Dạy bù {m.original.classCode} · {m.original.subjectName}
                      {m.makeup
                        ? ` → ${VI_DAY(m.makeup.dayOfWeek)} ${VI_DATE(m.makeup.date)} Tiết ${m.makeup.periodOrderNo}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run("Đã hủy tiết dạy bù.", () =>
                          post("/api/substitutions/makeup-cancel", { makeupLessonId: m.id }),
                        )
                      }
                      className="mt-1.5 inline-flex min-h-11 items-center rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:border-red-400 hover:bg-red-50 disabled:opacity-50"
                    >
                      Hủy dạy bù
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Panel dock: bottom sheet (<xl), sticky rail (≥xl) — same pattern
            as the planner editor. Backdrop z-30 stays below the sidebar. */}
        {selected && grid ? (
          <>
            <div
              className="no-print fixed inset-0 z-30 bg-zinc-950/40 backdrop-blur-[2px] xl:hidden"
              onClick={() => setSelected(null)}
              aria-hidden="true"
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Thao tác tiết học"
              className="no-print fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl [@supports(height:100dvh)]:max-h-[85dvh] xl:sticky xl:inset-x-auto xl:bottom-auto xl:top-4 xl:z-auto xl:max-h-[calc(100vh-2rem)] xl:w-80 xl:shrink-0 xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:rounded-none xl:shadow-none"
            >
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Đóng"
                className="flex h-11 w-full shrink-0 items-center justify-center xl:hidden"
              >
                <span className="h-1 w-10 rounded-full bg-zinc-300" aria-hidden="true" />
              </button>
              <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1 xl:px-0 xl:pb-0 xl:pt-0">
                <EntryOpsPanel
                  entry={selected}
                  grid={grid}
                  teachers={teachers}
                  busy={busy}
                  onSubstitute={(substituteTeacherId, reason, autoConfirm) =>
                    run("Đã phân công dạy thay.", () =>
                      post("/api/substitutions", {
                        entryId: selected.id,
                        substituteTeacherId,
                        reason,
                        autoConfirm,
                      }),
                    )
                  }
                  onCancelLesson={(reason) =>
                    run("Đã hủy tiết học.", () =>
                      post("/api/substitutions/cancel-lesson", { entryId: selected.id, reason }),
                    )
                  }
                  onMakeup={(academicDayId, periodId, reason) =>
                    run("Đã tạo tiết dạy bù.", () =>
                      post("/api/substitutions/makeup", {
                        originalEntryId: selected.id,
                        academicDayId,
                        periodId,
                        reason,
                      }),
                    )
                  }
                  onClose={() => setSelected(null)}
                />
              </div>
            </aside>
          </>
        ) : null}
      </div>

      {error && <Toast kind="error" message={error} onClose={() => setError(null)} />}
      {toast && (
        <Toast
          key={toast.id}
          kind="success"
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function EntryOpsPanel({
  entry,
  grid,
  teachers,
  busy,
  onSubstitute,
  onCancelLesson,
  onMakeup,
  onClose,
}: {
  entry: LiveEntry;
  grid: LiveGrid;
  teachers: { id: string; code: string; fullName: string; shortName: string }[];
  busy: boolean;
  onSubstitute: (substituteTeacherId: string, reason: string | null, autoConfirm: boolean) => void;
  onCancelLesson: (reason: string | null) => void;
  onMakeup: (academicDayId: string, periodId: string, reason: string | null) => void;
  onClose: () => void;
}) {
  const [substituteId, setSubstituteId] = useState(teachers[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [makeupDayId, setMakeupDayId] = useState(grid.days[0]?.id ?? "");
  const [makeupPeriodId, setMakeupPeriodId] = useState(grid.periods[0]?.id ?? "");
  const schoolDays = grid.days.filter((d) => d.isSchoolDay);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          Tiết học được chọn
          <span className="mt-0.5 block text-xs font-normal text-zinc-500">
            {entry.status === "CANCELLED" ? "Đã hủy — có thể dạy bù" : entry.status === "SUBSTITUTED" ? "Đã có người dạy thay" : "Bình thường"}
          </span>
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

      {entry.status === "CANCELLED" ? (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-zinc-500">Tạo tiết dạy bù (giáo viên gốc, môn đã hủy).</p>
          <Select
            label="Ngày dạy bù"
            labelVisible
            value={makeupDayId}
            onChange={(e) => setMakeupDayId(e.target.value)}
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
            value={makeupPeriodId}
            onChange={(e) => setMakeupPeriodId(e.target.value)}
          >
            {grid.sessions.map((s) => (
              <optgroup key={s.id} label={s.labelVi}>
                {grid.periods
                  .filter((p) => p.sessionId === s.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      Tiết {p.orderNo} · {p.startTime}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Lý do</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onMakeup(makeupDayId, makeupPeriodId, reason || null)}
            className="w-full rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            Tạo tiết dạy bù
          </button>
        </div>
      ) : entry.status === "SUBSTITUTED" ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          Tiết học này đã có giáo viên dạy thay (xem danh sách bên dưới để hủy nếu cần).
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <Select
            label="Giáo viên dạy thay"
            labelVisible
            value={substituteId}
            onChange={(e) => setSubstituteId(e.target.value)}
          >
            {teachers
              .filter((t) => t.id !== entry.teacherId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.code})
                </option>
              ))}
          </Select>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Lý do</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Vắng phép, công tác…"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !substituteId}
              onClick={() => onSubstitute(substituteId, reason || null, true)}
              className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              Phân công dạy thay
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancelLesson(reason || null)}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Hủy tiết
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

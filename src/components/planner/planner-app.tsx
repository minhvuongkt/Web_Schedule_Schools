"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  api,
  type ClassRef,
  type GridEntry,
  type RoomRef,
  type SubjectRef,
  type TeacherRef,
  type ValidateReport,
  type VersionGrid,
  type VersionSummary,
  type WeekSummary,
} from "./api";
import { EntryPanel } from "./entry-panel";
import { IssuesPanel } from "./issues-panel";
import { WorkloadBadge } from "./workload-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { Portal } from "@/components/ui/portal";
import { Select } from "@/components/ui/select";
import { Toast } from "@/components/ui/toast";
import { useScrollLock } from "@/components/ui/use-scroll-lock";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-zinc-200 text-zinc-500",
};

const STATUS_VI: Record<string, string> = {
  DRAFT: "Bản nháp",
  REVIEW: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  PUBLISHED: "Đã công bố",
  ARCHIVED: "Đã lưu trữ",
};

interface ToastState {
  id: number;
  kind: "error" | "success";
  message: string;
}

const VI_DAY = (dow: number) => (dow === 7 ? "Chủ nhật" : `Thứ ${dow + 1}`);
const VI_DATE = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

interface UndoAction {
  label: string;
  undo: () => Promise<void>;
}

interface Props {
  user: { role: string; displayName: string };
}

export function PlannerApp({ user }: Props) {
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [weekId, setWeekId] = useState<string>("");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionId, setVersionId] = useState<string>("");
  const [grid, setGrid] = useState<VersionGrid | null>(null);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [teachers, setTeachers] = useState<TeacherRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [rooms, setRooms] = useState<RoomRef[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [selectedEntry, setSelectedEntry] = useState<GridEntry | null>(null);
  const [targetCell, setTargetCell] = useState<{ dayId: string; periodId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [report, setReport] = useState<ValidateReport | null>(null);
  const [busy, setBusy] = useState(false);
  const undoStack = useRef<UndoAction[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [highlightEntryId, setHighlightEntryId] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const toastSeq = useRef(0);

  const sheetOpen = Boolean(selectedEntry || targetCell || report);
  useScrollLock(sheetOpen || actionsOpen);

  const canWrite = user.role === "TIMETABLE_ADMIN" || user.role === "SUPER_ADMIN";
  const canApprove = user.role === "PRINCIPAL" || user.role === "SUPER_ADMIN";

  /** Success feedback: light toast, auto-dismissed after 4s. */
  const flashNotice = useCallback((message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setError(null);
    const id = ++toastSeq.current;
    setToast({ id, kind: "success", message });
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

  /** Error feedback also auto-dismisses (8s) so a toast can never
      permanently cover toolbar controls; manual close always available. */
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 8000);
    return () => window.clearTimeout(t);
  }, [error]);

  /** Esc closes the entry sheet / action sheet (mirrors ConfirmDialog). */
  useEffect(() => {
    if (!sheetOpen && !actionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (actionsOpen) setActionsOpen(false);
      else {
        setSelectedEntry(null);
        setTargetCell(null);
        setReport(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, actionsOpen]);

  const loadVersions = useCallback(async (wid: string) => {
    const data = await api.versions(wid);
    setVersions(data.versions);
    return data.versions;
  }, []);

  const loadGrid = useCallback(async (vid: string) => {
    const data = await api.versionGrid(vid);
    setGrid(data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [w, c, t, s, r] = await Promise.all([
          api.weeks(),
          api.classes(),
          api.teachers(),
          api.subjects(),
          api.rooms(),
        ]);
        setWeeks(w.weeks);
        setClasses(c.classes);
        setTeachers(t.teachers);
        setSubjects(s.subjects);
        setRooms(r.rooms);
        if (w.weeks.length > 0) {
          setWeekId(w.weeks[0].id);
          const vs = await loadVersions(w.weeks[0].id);
          if (vs.length > 0) {
            setVersionId(vs[0].id);
            await loadGrid(vs[0].id);
          }
        }
        if (c.classes.length > 0) setClassId(c.classes[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được dữ liệu.");
      }
    })();
  }, [loadVersions, loadGrid]);

  useEffect(() => {
    if (!versionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.versionGrid(versionId);
        if (!cancelled) setGrid(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được phiên bản.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  const version = grid?.version;
  const editable = version?.status === "DRAFT";

  const refresh = useCallback(async () => {
    if (!versionId) return;
    const [g, vs] = await Promise.all([api.versionGrid(versionId), api.versions(weekId)]);
    setGrid(g);
    setVersions(vs.versions);
  }, [versionId, weekId]);

  const pushUndo = useCallback((action: UndoAction) => {
    undoStack.current.push(action);
    setUndoCount(undoStack.current.length);
  }, []);

  const runUndo = useCallback(async () => {
    const action = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!action) return;
    try {
      await action.undo();
      await refresh();
      flashNotice(`Đã hoàn tác: ${action.label}`);
    } catch (e) {
      setError(`Hoàn tác thất bại: ${e instanceof Error ? e.message : "lỗi"}`);
      await refresh();
    }
  }, [refresh, flashNotice]);

  const handleCreate = async (payload: Omit<GridEntry, "id" | "status" | "notes"> & { notes?: string | null }): Promise<void> => {
    if (!version || !editable) return;
    setBusy(true);
    try {
      await api.createEntry({
        versionId: version.id,
        academicDayId: payload.academicDayId,
        periodId: payload.periodId,
        classId: payload.classId,
        subjectId: payload.subjectId,
        subjectComponentId: payload.subjectComponentId,
        teacherId: payload.teacherId,
        roomId: payload.roomId,
        notes: payload.notes,
        expectedRevision: version.revision,
      });
      await refresh();
      flashNotice("Đã thêm tiết học.");
      setTargetCell(null);
    } catch (e) {
      handleError(e, "Thêm tiết học thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (entry: GridEntry, patch: Partial<GridEntry>): Promise<void> => {
    if (!version || !editable) return;
    setBusy(true);
    try {
      await api.updateEntry(entry.id, { ...patch, expectedRevision: version.revision });
      pushUndo({
        label: `Sửa tiết ${entry.id.slice(0, 8)}`,
        undo: async () => {
          await api.updateEntry(entry.id, {
            academicDayId: entry.academicDayId,
            periodId: entry.periodId,
            classId: entry.classId,
            subjectId: entry.subjectId,
            subjectComponentId: entry.subjectComponentId,
            teacherId: entry.teacherId,
            roomId: entry.roomId,
            notes: entry.notes,
            expectedRevision: grid?.version.revision ?? version.revision,
          });
        },
      });
      await refresh();
      flashNotice("Đã cập nhật tiết học.");
    } catch (e) {
      handleError(e, "Cập nhật thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (entry: GridEntry, dayId: string, periodId: string) => {
    if (!version || !editable) return;
    setBusy(true);
    try {
      await api.updateEntry(entry.id, {
        academicDayId: dayId,
        periodId,
        expectedRevision: version.revision,
      });
      pushUndo({
        label: "Di chuyển tiết học",
        undo: async () => {
          await api.updateEntry(entry.id, {
            academicDayId: entry.academicDayId,
            periodId: entry.periodId,
            expectedRevision: grid?.version.revision ?? version.revision,
          });
        },
      });
      await refresh();
      flashNotice("Đã di chuyển tiết học.");
    } catch (e) {
      handleError(e, "Di chuyển thất bại (trùng lịch?).");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (entry: GridEntry) => {
    if (!version || !editable) return;
    setBusy(true);
    try {
      await api.deleteEntry(entry.id, version.revision);
      pushUndo({
        label: "Xóa tiết học",
        undo: async () => {
          await api.createEntry({
            versionId: version.id,
            academicDayId: entry.academicDayId,
            periodId: entry.periodId,
            classId: entry.classId,
            subjectId: entry.subjectId,
            subjectComponentId: entry.subjectComponentId,
            teacherId: entry.teacherId,
            roomId: entry.roomId,
            notes: entry.notes,
            expectedRevision: grid?.version.revision ?? version.revision,
          });
        },
      });
      await refresh();
      setSelectedEntry(null);
      flashNotice("Đã xóa tiết học.");
    } catch (e) {
      handleError(e, "Xóa thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const handleError = (e: unknown, fallback: string) => {
    if (e instanceof ApiError) {
      if (e.code === "VERSION_OUTDATED") {
        setError("Phiên bản lỗi thời — đã có người khác cập nhật. Hãy tải lại.");
        refresh().catch(() => undefined);
        return;
      }
      setError(e.message);
      const ids = e.details?.entryIds;
      if (Array.isArray(ids) && ids.length > 0) {
        setHighlightEntryId(String(ids[0]));
      }
      const cid = e.details?.conflictingEntryId;
      if (typeof cid === "string") setHighlightEntryId(cid);
    } else {
      setError(fallback);
    }
  };

  const handleWorkflow = async (
    action: "submit-review" | "approve" | "publish",
    confirmText: string,
  ) => {
    if (!versionId || !confirm(confirmText)) return;
    setBusy(true);
    try {
      if (action === "submit-review") await api.submitReview(versionId);
      else if (action === "approve") await api.approve(versionId);
      else await api.publish(versionId);
      await refresh();
      flashNotice("Đã cập nhật trạng thái phiên bản.");
    } catch (e) {
      handleError(e, "Thao tác thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDraft = async (copy: boolean) => {
    if (!weekId) return;
    const source = copy ? versionId || undefined : undefined;
    if (copy && !source) return;
    setBusy(true);
    try {
      const data = await api.createVersion(weekId, source);
      await loadVersions(weekId);
      setVersionId(data.version.id);
      await loadGrid(data.version.id);
      flashNotice(`Đã tạo bản nháp v${data.version.versionNo}.`);
    } catch (e) {
      handleError(e, "Tạo bản nháp thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async () => {
    if (!versionId) return;
    setBusy(true);
    try {
      const data = await api.validate(versionId);
      setReport(data);
    } catch (e) {
      handleError(e, "Kiểm tra thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const clearPanels = () => {
    setSelectedEntry(null);
    setTargetCell(null);
    setReport(null);
  };

  /**
   * DRAFT-only delete. No expectedRevision on version deletes, so the
   * realistic races are 404 (someone deleted first) and 409 (transitioned)
   * — both resync the version list. Relies on the versionId effect to load
   * the next grid (refresh() would hold a stale versionId closure).
   */
  const handleDeleteVersion = async () => {
    if (!versionId || version?.status !== "DRAFT" || !canWrite) return;
    setBusy(true);
    try {
      const result = await api.deleteVersion(versionId);
      clearPanels();
      setGrid(null);
      setHighlightEntryId(null);
      undoStack.current = [];
      setUndoCount(0);
      const remaining = await loadVersions(weekId);
      setVersionId(remaining.length > 0 ? remaining[0].id : "");
      flashNotice(`Đã xóa bản nháp (${result.deletedEntries} tiết).`);
    } catch (e) {
      handleError(e, "Xóa bản nháp thất bại.");
      if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
        clearPanels();
        setGrid(null);
        const remaining = await loadVersions(weekId).catch(() => [] as VersionSummary[]);
        setVersionId(remaining[0]?.id ?? "");
      }
    } finally {
      setBusy(false);
      setShowDeleteConfirm(false);
    }
  };

  // keyboard: ctrl+z undo, ctrl+shift+z redo is not implemented (single undo stack)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        runUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runUndo]);

  const entryByCell = useMemo(() => {
    const map = new Map<string, GridEntry>();
    for (const entry of grid?.entries ?? []) {
      if (entry.classId !== classId) continue;
      map.set(`${entry.academicDayId}|${entry.periodId}`, entry);
    }
    return map;
  }, [grid, classId]);

  const schoolDays = useMemo(
    () => (grid?.days ?? []).filter((d) => d.isSchoolDay),
    [grid],
  );

  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  if (weeks.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-zinc-500">
        Chưa có tuần học nào.
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* left column: sticky toolbar + grid. The toolbar lives INSIDE this
            column so the right rail sticks independently (no shared offset);
            mobile top bar (AppShell) is h-14 → top-14, ≥lg no top bar → top-0.
            Rows wrap instead of scrolling so every button (incl. Xóa bản nháp)
            is always visible. */}
        <div className="min-w-0 flex-1">
          {/* Compact sticky toolbar. Height is BOUNDED (max-h + internal
              scroll) so sticky can never push controls out of reach; on
              <lg the lifecycle actions live in the "Thao tác" action sheet
              instead of wrapping over multiple rows. */}
          <div className="no-print sticky top-14 z-20 mb-4 max-h-[calc(100vh-3.5rem)] space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm [@supports(height:100dvh)]:max-h-[calc(100dvh-3.5rem)] lg:top-0 lg:max-h-none lg:overflow-visible">
            {/* Context row: selects full-width on phones, sharing a row ≥sm.
                The auto track keeps status + the mobile actions trigger. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <Select
                label="Chọn tuần"
                className="min-w-0"
                value={weekId}
                onChange={(e) => {
                  setWeekId(e.target.value);
                  setVersionId("");
                  setGrid(null);
                  setReport(null);
                  undoStack.current = [];
                  setUndoCount(0);
                  loadVersions(e.target.value).then((vs) => {
                    if (vs.length > 0) setVersionId(vs[0].id);
                  });
                }}
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    Tuần {String(w.weekNo).padStart(2, "0")} ({VI_DATE(w.weekStart)} –{" "}
                    {VI_DATE(w.weekEnd)})
                  </option>
                ))}
              </Select>

              <Select
                label="Chọn phiên bản"
                className="min-w-0"
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNo} · {STATUS_VI[v.status] ?? v.status} ({v.entryCount} tiết)
                  </option>
                ))}
                {versions.length === 0 && <option value="">—</option>}
              </Select>

              <div className="flex items-center justify-between gap-2 sm:justify-end">
                {version && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[version.status] ?? ""}`}
                  >
                    {STATUS_VI[version.status] ?? version.status}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setActionsOpen(true)}
                  aria-haspopup="dialog"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 lg:hidden"
                >
                  <Icon name="settings" size={15} />
                  Thao tác
                </button>
              </div>
            </div>

            {/* Desktop actions (unchanged position ≥lg; hidden behind the
                action sheet <lg). Delete is ALWAYS rendered for canWrite —
                disabled with a reason when the version is not a draft. */}
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={handleValidate}
                disabled={busy || !versionId}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 disabled:opacity-50"
              >
                Kiểm tra
              </button>
              {version?.status === "DRAFT" && canWrite && (
                <button
                  type="button"
                  onClick={() => handleWorkflow("submit-review", "Gửi phiên bản này để duyệt?")}
                  disabled={busy}
                  className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
                >
                  Gửi duyệt
                </button>
              )}
              {version?.status === "REVIEW" && canApprove && (
                <button
                  type="button"
                  onClick={() => handleWorkflow("approve", "Phê duyệt phiên bản này?")}
                  disabled={busy}
                  className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  Phê duyệt
                </button>
              )}
              {version?.status === "APPROVED" && (canWrite || canApprove) && (
                <button
                  type="button"
                  onClick={() => handleWorkflow("publish", "Công bố phiên bản này? Bản công bố cũ sẽ được lưu trữ.")}
                  disabled={busy}
                  className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                >
                  Công bố
                </button>
              )}
              <button
                type="button"
                onClick={runUndo}
                disabled={undoCount === 0 || busy}
                title="Hoàn tác thao tác vừa rồi (Ctrl+Z)"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 disabled:opacity-50"
              >
                <Icon name="history-icon" size={15} />
                Hoàn tác ({undoCount})
              </button>
              <button
                type="button"
                onClick={() => handleCreateDraft(false)}
                disabled={busy}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 disabled:opacity-50"
              >
                Tạo bản nháp mới
              </button>
              {versionId && (
                <button
                  type="button"
                  onClick={() => handleCreateDraft(true)}
                  disabled={busy}
                  title="Nhân bản phiên bản đang chọn thành bản nháp mới"
                  className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 disabled:opacity-50"
                >
                  Nhân bản
                </button>
              )}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={busy || !versionId || version?.status !== "DRAFT"}
                  title={
                    version?.status === "DRAFT"
                      ? "Xóa bản nháp đang chọn (không thể hoàn tác)"
                      : "Chỉ bản nháp mới được xóa — phiên bản đã duyệt/công bố là lịch sử bất biến"
                  }
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="trash-2" size={15} />
                  Xóa bản nháp
                </button>
              )}
            </div>

            {/* Class chips: single-line scroll <lg (predictable height),
                wrap ≥lg. */}
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 pr-1 text-xs font-medium text-zinc-500">Lớp</span>
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:pb-0">
                {classes.map((c) => {
                  const active = c.id === classId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setClassId(c.id)}
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
              <div className="shrink-0">
                <WorkloadBadge
                  entries={grid?.entries ?? []}
                  classId={classId}
                  editable={Boolean(editable)}
                  teachers={teachers}
                />
              </div>
            </div>
          </div>

          {/* persistent context strip (feedback lives in toasts) */}
          {version && !editable && (
            <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600">
              Phiên bản {STATUS_VI[version.status] ?? version.status} — chỉ xem (không chỉnh sửa
              được). Tạo bản nháp để chỉnh sửa.
            </div>
          )}

          <div className="overflow-x-auto [&_table]:min-w-2xl">
          {!grid ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
              {versions.length === 0
                ? "Chưa có phiên bản nào — tạo bản nháp mới hoặc nhập từ Excel."
                : "Đang tải…"}
            </div>
          ) : (
            <div className="space-y-4">
              {grid.sessions.map((session) => {
                const periods = grid.periods.filter((p) => p.sessionId === session.id);
                return (
                  <section key={session.id}>
                    <h3 className="mb-1.5 text-sm font-semibold text-zinc-700">
                      {session.labelVi}
                    </h3>
                    <table className="w-full table-fixed border-collapse text-sm">
                      <thead>
                        <tr className="bg-zinc-50">
                          <th className="sticky left-0 z-10 w-32 border border-r-0 border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left text-xs font-medium text-zinc-500 shadow-[inset_-1px_0_0_#e4e4e7]">
                            Tiết
                          </th>
                          {schoolDays.map((day) => (
                            <th
                              key={day.id}
                              className="border border-zinc-200 px-2 py-1.5 text-center text-xs"
                            >
                              <span className="block font-semibold text-zinc-900">
                                {VI_DAY(day.dayOfWeek)}
                              </span>
                              <span className="block text-zinc-500">{VI_DATE(day.date)}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periods.map((period) => (
                          <tr key={period.id}>
                            <th scope="row" className="sticky left-0 z-10 border border-r-0 border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left align-top shadow-[inset_-1px_0_0_#e4e4e7]">
                              <span className="block text-xs font-medium">
                                Tiết {period.orderNo}
                              </span>
                              <span className="block text-xs text-zinc-500">
                                {period.startTime}
                              </span>
                            </th>
                            {schoolDays.map((day) => {
                              const entry = entryByCell.get(`${day.id}|${period.id}`);
                              const isTarget =
                                targetCell?.dayId === day.id && targetCell?.periodId === period.id;
                              const highlighted = entry && entry.id === highlightEntryId;
                              return (
                                <td
                                  key={day.id}
                                  draggable={editable && Boolean(entry)}
                                  onDragStart={() => entry && setSelectedEntry(entry)}
                                  onDragOver={(e) => editable && e.preventDefault()}
                                  onDrop={() => {
                                    if (editable && selectedEntry && entry?.id !== selectedEntry.id) {
                                      handleMove(selectedEntry, day.id, period.id);
                                    }
                                  }}
                                  onClick={() => {
                                    if (!editable) {
                                      if (entry) setSelectedEntry(entry);
                                      return;
                                    }
                                    if (entry) setSelectedEntry(entry);
                                    else {
                                      setTargetCell({ dayId: day.id, periodId: period.id });
                                      setSelectedEntry(null);
                                    }
                                  }}
                                  className={`cursor-pointer border border-zinc-200 px-2 py-1.5 align-top ${
                                    isTarget ? "bg-blue-50 ring-2 ring-blue-400" : ""
                                  } ${highlighted ? "ring-2 ring-red-500" : ""} ${
                                    entry ? "bg-white" : "bg-zinc-50/50"
                                  }`}
                                >
                                  {entry ? (
                                    <div>
                                      <span className="block text-xs font-medium text-zinc-900">
                                        {subjectById.get(entry.subjectId)?.name ?? "?"}
                                        {entry.subjectComponentId
                                          ? ` (${
                                              subjectById
                                                .get(entry.subjectId)
                                                ?.components.find(
                                                  (c) => c.id === entry.subjectComponentId,
                                                )?.name ?? "?"
                                            })`
                                          : ""}
                                      </span>
                                      <span className="block text-xs text-zinc-500">
                                        {teacherById.get(entry.teacherId)?.shortName ?? "?"}
                                      </span>
                                      {entry.roomId && (
                                        <span className="block text-xs text-zinc-400">
                                          {roomById.get(entry.roomId)?.code}
                                        </span>
                                      )}
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
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/* Panel dock: bottom sheet (<xl) so the grid stays visible; sticky
            right rail (≥xl) sticking at top-4 — safe because the toolbar is
            inside the LEFT column (no offset coupling). Backdrop z-30 stays
            below the desktop sidebar (z-40) so the sidebar remains usable
            while a panel is open at lg–xl. */}
        {sheetOpen && (
          <>
            <div
              className="no-print fixed inset-0 z-30 bg-zinc-950/40 backdrop-blur-[2px] xl:hidden"
              onClick={clearPanels}
              aria-hidden="true"
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Sửa tiết học"
              className="no-print fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl [@supports(height:100dvh)]:max-h-[85dvh] xl:sticky xl:inset-x-auto xl:bottom-auto xl:top-4 xl:z-auto xl:max-h-[calc(100vh-2rem)] xl:w-80 xl:shrink-0 xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:rounded-none xl:shadow-none"
            >
              <button
                type="button"
                onClick={clearPanels}
                aria-label="Đóng"
                className="flex h-11 w-full shrink-0 items-center justify-center xl:hidden"
              >
                <span className="h-1 w-10 rounded-full bg-zinc-300" aria-hidden="true" />
              </button>
              <div className="space-y-4 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1 xl:px-0 xl:pb-0 xl:pt-0">
                {(selectedEntry || targetCell) && version && (
                  <EntryPanel
                    key={selectedEntry?.id ?? `${targetCell?.dayId}|${targetCell?.periodId}`}
                    entry={selectedEntry}
                    cell={targetCell ?? (selectedEntry
                      ? { dayId: selectedEntry.academicDayId, periodId: selectedEntry.periodId }
                      : null)}
                    grid={grid}
                    classes={classes}
                    teachers={teachers}
                    subjects={subjects}
                    rooms={rooms}
                    classFilter={classId}
                    editable={editable && canWrite}
                    busy={busy}
                    onCreate={handleCreate}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onClose={() => {
                      setSelectedEntry(null);
                      setTargetCell(null);
                    }}
                  />
                )}
                {report && (
                  <IssuesPanel
                    report={report}
                    onLocate={(ids) => {
                      const id = Array.isArray(ids) ? String(ids[0]) : String(ids);
                      setHighlightEntryId(id);
                      const entry = grid?.entries.find((e) => e.id === id);
                      if (entry) setClassId(entry.classId);
                    }}
                    onClose={() => setReport(null)}
                  />
                )}
              </div>
            </aside>
          </>
        )}
      </div>
      </div>

      {/* Mobile action sheet (<lg): all lifecycle actions incl. delete.
          Portaled so it stacks above the toolbar deterministically. */}
      {actionsOpen ? (
        <Portal>
          <div
            className="no-print fixed inset-0 z-30 bg-zinc-950/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setActionsOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Thao tác phiên bản"
            className="no-print fixed inset-x-0 bottom-0 z-50 flex max-h-[60vh] animate-fade-up flex-col rounded-t-2xl bg-white shadow-2xl [@supports(height:100dvh)]:max-h-[60dvh] lg:hidden"
          >
            <button
              type="button"
              onClick={() => setActionsOpen(false)}
              aria-label="Đóng"
              className="flex h-11 w-full shrink-0 items-center justify-center"
            >
              <span className="h-1 w-10 rounded-full bg-zinc-300" aria-hidden="true" />
            </button>
            <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <p className="mb-2 text-xs font-medium text-zinc-500">
                {version
                  ? `v${version.versionNo} · ${STATUS_VI[version.status] ?? version.status} · ${versions.find((v) => v.id === versionId)?.entryCount ?? grid?.entries.length ?? 0} tiết`
                  : "Chưa chọn phiên bản"}
              </p>
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      handleValidate();
                    }}
                    disabled={busy || !versionId}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40"
                  >
                    <Icon name="check" size={17} />
                    Kiểm tra xung đột
                  </button>
                </li>
                {version?.status === "DRAFT" && canWrite && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        handleWorkflow("submit-review", "Gửi phiên bản này để duyệt?");
                      }}
                      disabled={busy}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-40"
                    >
                      <Icon name="arrow-right" size={17} />
                      Gửi duyệt
                    </button>
                  </li>
                )}
                {version?.status === "REVIEW" && canApprove && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        handleWorkflow("approve", "Phê duyệt phiên bản này?");
                      }}
                      disabled={busy}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-40"
                    >
                      <Icon name="check" size={17} />
                      Phê duyệt
                    </button>
                  </li>
                )}
                {version?.status === "APPROVED" && (canWrite || canApprove) && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        handleWorkflow("publish", "Công bố phiên bản này? Bản công bố cũ sẽ được lưu trữ.");
                      }}
                      disabled={busy}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-40"
                    >
                      <Icon name="external-link" size={17} />
                      Công bố
                    </button>
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      runUndo();
                    }}
                    disabled={undoCount === 0 || busy}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40"
                  >
                    <Icon name="history-icon" size={17} />
                    Hoàn tác ({undoCount})
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      handleCreateDraft(false);
                    }}
                    disabled={busy}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40"
                  >
                    <Icon name="plus" size={17} />
                    Tạo bản nháp mới
                  </button>
                </li>
                {versionId && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        handleCreateDraft(true);
                      }}
                      disabled={busy}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40"
                    >
                      <Icon name="file-spreadsheet" size={17} />
                      Nhân bản phiên bản này
                    </button>
                  </li>
                )}
                {canWrite && (
                  <li className="border-t border-zinc-100 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        setShowDeleteConfirm(true);
                      }}
                      disabled={busy || !versionId || version?.status !== "DRAFT"}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="trash-2" size={17} />
                      Xóa bản nháp
                    </button>
                    {!versionId || version?.status !== "DRAFT" ? (
                      <p className="px-3 pb-1 text-xs text-zinc-500">
                        Chỉ bản nháp mới được xóa — phiên bản đã duyệt/công bố là
                        lịch sử bất biến.
                      </p>
                    ) : null}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </Portal>
      ) : null}

      {/* feedback overlays (viewport-anchored via portal) */}
      {error && (
        <Toast kind="error" message={error} onClose={() => setError(null)} />
      )}
      {toast && (
        <Toast
          key={toast.id}
          kind={toast.kind}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Xóa bản nháp này?"
        tone="danger"
        busy={busy}
        confirmLabel="Xóa bản nháp"
        onConfirm={handleDeleteVersion}
        onCancel={() => setShowDeleteConfirm(false)}
        description={
          version ? (
            <>
              Xóa <strong>v{version.versionNo} · {STATUS_VI.DRAFT}</strong> cùng{" "}
              <strong>{grid?.entries.length ?? 0} tiết học</strong> đã xếp trong tuần
              này. Thao tác này không thể hoàn tác; các phiên bản khác và phiên
              bản đã công bố không bị ảnh hưởng.
            </>
          ) : null
        }
      />
    </div>
  );
}

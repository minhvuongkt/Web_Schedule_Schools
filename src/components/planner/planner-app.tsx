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

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-zinc-200 text-zinc-500",
};

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
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<ValidateReport | null>(null);
  const [busy, setBusy] = useState(false);
  const undoStack = useRef<UndoAction[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [highlightEntryId, setHighlightEntryId] = useState<string | null>(null);

  const canWrite = user.role === "TIMETABLE_ADMIN" || user.role === "SUPER_ADMIN";
  const canApprove = user.role === "PRINCIPAL" || user.role === "SUPER_ADMIN";

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
      setNotice(`Đã hoàn tác: ${action.label}`);
    } catch (e) {
      setError(`Hoàn tác thất bại: ${e instanceof Error ? e.message : "lỗi"}`);
      await refresh();
    }
  }, [refresh]);

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
      setNotice("Đã thêm tiết học.");
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
      setNotice("Đã cập nhật tiết học.");
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
      setNotice("Đã di chuyển tiết học.");
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
      setNotice("Đã xóa tiết học.");
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
      setNotice("Đã cập nhật trạng thái phiên bản.");
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
      setNotice(`Đã tạo bản nháp v${data.version.versionNo}.`);
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
    <div className="mx-auto max-w-7xl px-4 py-4">
      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select
          value={weekId}
          onChange={(e) => {
            setWeekId(e.target.value);
            setVersionId("");
            setGrid(null);
            setReport(null);
            loadVersions(e.target.value).then((vs) => {
              if (vs.length > 0) setVersionId(vs[0].id);
            });
          }}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5"
        >
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>
              Tuần {String(w.weekNo).padStart(2, "0")} ({VI_DATE(w.weekStart)} –{" "}
              {VI_DATE(w.weekEnd)})
            </option>
          ))}
        </select>

        <select
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versionNo} · {v.status} ({v.entryCount} tiết)
            </option>
          ))}
          {versions.length === 0 && <option value="">—</option>}
        </select>

        {version && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[version.status] ?? ""}`}
          >
            {version.status}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleCreateDraft(false)}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:border-zinc-500 disabled:opacity-50"
          >
            Tạo bản nháp mới
          </button>
          {versionId && (
            <button
              type="button"
              onClick={() => handleCreateDraft(true)}
              disabled={busy}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:border-zinc-500 disabled:opacity-50"
            >
              Nhân bản từ phiên bản này
            </button>
          )}
          <button
            type="button"
            onClick={handleValidate}
            disabled={busy || !versionId}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:border-zinc-500 disabled:opacity-50"
          >
            Kiểm tra
          </button>
          {version?.status === "DRAFT" && canWrite && (
            <button
              type="button"
              onClick={() => handleWorkflow("submit-review", "Gửi phiên bản này để duyệt?")}
              disabled={busy}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              Gửi duyệt
            </button>
          )}
          {version?.status === "REVIEW" && canApprove && (
            <button
              type="button"
              onClick={() => handleWorkflow("approve", "Phê duyệt phiên bản này?")}
              disabled={busy}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              Phê duyệt
            </button>
          )}
          {version?.status === "APPROVED" && (canWrite || canApprove) && (
            <button
              type="button"
              onClick={() => handleWorkflow("publish", "Công bố phiên bản này? Bản công bố cũ sẽ được lưu trữ.")}
              disabled={busy}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              Công bố
            </button>
          )}
          <button
            type="button"
            onClick={runUndo}
            disabled={undoCount === 0 || busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:border-zinc-500 disabled:opacity-50"
          >
            Hoàn tác ({undoCount})
          </button>
        </div>
      </div>

      {/* banners */}
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-3 underline">
            Đóng
          </button>
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="ml-3 underline">
            Đóng
          </button>
        </div>
      )}
      {version && !editable && (
        <div className="mb-3 rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
          Phiên bản {version.status} — chỉ xem (không chỉnh sửa được). Tạo bản nháp để chỉnh sửa.
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* grid */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <label htmlFor="class-select" className="font-medium text-zinc-700">
              Lớp
            </label>
            <select
              id="class-select"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
            <WorkloadBadge
              entries={grid?.entries ?? []}
              classId={classId}
              editable={Boolean(editable)}
            />
          </div>

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
                          <th className="w-32 border border-zinc-200 px-2 py-1.5 text-left text-xs font-medium text-zinc-500">
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
                            <th className="border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left align-top">
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

        {/* side panels */}
        <aside className="w-full shrink-0 space-y-4 xl:w-80">
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
        </aside>
      </div>
    </div>
  );
}

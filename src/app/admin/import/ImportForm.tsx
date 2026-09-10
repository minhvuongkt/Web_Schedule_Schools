"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

interface WeekOption {
  id: string;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
}

interface ImportIssue {
  type: string;
  severity: "ERROR" | "WARNING";
  message: string;
  details?: Record<string, unknown>;
}

interface PreviewEntry {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectComponentId: string | null;
  subjectComponentName: string | null;
  teacherId: string;
  teacherName: string;
  dayLabel: string;
  dateIso: string | null;
  sessionCode: string;
  periodNo: number;
  sourceRow: number;
}

interface UnmappedRow {
  entry: {
    sourceRow: number;
    dayLabel: string;
    classCode: string;
    subjectLabel: string;
    teacherAlias: string;
  };
  reasons: string[];
  suggestions?: {
    classLabels: string[];
    subjectLabels: string[];
    teacherLabels: string[];
  };
}

interface PreviewResponse {
  preview: {
    weekId: string;
    weekNo: number;
    weekStart: string;
    weekEnd: string;
    sheetName: string;
    declaredRange: { start: string; end: string } | null;
    suggestedWeekId: string | null;
    weekMatch: boolean;
    entries: PreviewEntry[];
    unmapped: UnmappedRow[];
    issues: ImportIssue[];
    counts: { entries: number; issues: number; errors: number };
  };
}

interface CommitResponse {
  version: { id: string; versionNo: number; status: string; name: string | null };
  entryCount: number;
}

const SESSION_LABELS: Record<string, string> = {
  MORNING: "Sáng",
  AFTERNOON: "Chiều",
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // route caps base64 at ~10 MB binary

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Không đọc được tệp."));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function viShortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Stamp that changes whenever the selected file changes. */
function fileStamp(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export default function ImportForm({ weeks }: { weeks: WeekOption[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [weekId, setWeekId] = useState("");
  const [busy, setBusy] = useState<null | "preview" | "commit">(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse["preview"] | null>(null);
  const [previewKey, setPreviewKey] = useState<string>("");
  const [committed, setCommitted] = useState<CommitResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [issueFilter, setIssueFilter] = useState<"all" | "ERROR" | "WARNING">("all");
  const [entryQuery, setEntryQuery] = useState("");
  const [showAllEntries, setShowAllEntries] = useState(false);

  const previewOfCurrentFile =
    preview !== null && file !== null && previewKey === `${fileStamp(file)}#${weekId || "auto"}`;

  function pickFile(candidate: File | null | undefined): boolean {
    if (!candidate) return false;
    if (!/\.(xls|xlsx)$/i.test(candidate.name)) {
      setError("Tệp phải có đuôi .xls hoặc .xlsx.");
      return false;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setError(`Tệp quá lớn (${formatBytes(candidate.size)}) — tối đa 10 MB.`);
      return false;
    }
    setError(null);
    setCommitted(null);
    setConfirming(false);
    setFile(candidate);
    return true;
  }

  async function callImport(mode: "preview" | "commit"): Promise<void> {
    if (!file) {
      setError("Vui lòng chọn tệp Excel (.xls hoặc .xlsx).");
      return;
    }
    if (mode === "commit" && !weekId) {
      setError("Vui lòng chọn tuần học trước khi nhập khẩu.");
      return;
    }
    setBusy(mode);
    setError(null);
    setCommitted(null);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const response = await fetch("/api/timetable/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64,
          fileName: file.name,
          weekId: weekId || undefined,
          mode,
        }),
      });
      const payload = (await response.json()) as PreviewResponse | CommitResponse | { error: { message: string } };
      if (!response.ok) {
        const message = (payload as { error?: { message?: string } }).error?.message;
        setError(message ?? `Lỗi ${response.status}.`);
        return;
      }
      if (mode === "preview") {
        const next = (payload as PreviewResponse).preview;
        setPreview(next);
        setPreviewKey(`${fileStamp(file)}#${weekId || "auto"}`);
        setConfirming(false);
        setShowAllEntries(false);
        setEntryQuery("");
        setIssueFilter(next.counts.errors > 0 ? "ERROR" : "all");
      } else {
        setPreview(null);
        setCommitted(payload as CommitResponse);
      }
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(null);
    }
  }

  function downloadTemplate(): void {
    const query = weekId ? `?weekId=${encodeURIComponent(weekId)}` : "";
    window.open(`/api/timetable/import/template${query}`, "_blank");
  }

  const summary = useMemo(() => {
    if (!preview) return null;
    const byClass = new Map<string, number>();
    const byDay = new Map<string, number>();
    for (const entry of preview.entries) {
      byClass.set(entry.className, (byClass.get(entry.className) ?? 0) + 1);
      const dayKey = entry.dateIso ?? "không rõ ngày";
      byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
    }
    return {
      byClass: [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b, "vi")),
      byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)),
    };
  }, [preview]);

  const filteredIssues = useMemo(() => {
    if (!preview) return [];
    if (issueFilter === "all") return preview.issues;
    return preview.issues.filter((issue) => issue.severity === issueFilter);
  }, [preview, issueFilter]);

  const errorCount = preview?.counts.errors ?? 0;
  const warningCount = preview ? preview.counts.issues - preview.counts.errors : 0;

  const matchedEntries = useMemo(() => {
    if (!preview) return [];
    const query = entryQuery.trim().toLowerCase();
    if (!query) return preview.entries;
    return preview.entries.filter((entry) =>
      [entry.className, entry.subjectName, entry.teacherName, entry.dayLabel, entry.dateIso ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [preview, entryQuery]);

  const visibleEntries = useMemo(
    () => (showAllEntries ? matchedEntries : matchedEntries.slice(0, 100)),
    [matchedEntries, showAllEntries],
  );

  const suggestedWeek = preview?.suggestedWeekId
    ? weeks.find((week) => week.id === preview.suggestedWeekId)
    : undefined;

  const canCommit =
    previewOfCurrentFile &&
    errorCount === 0 &&
    (preview?.unmapped.length ?? 0) === 0 &&
    weekId !== "" &&
    weekId === preview?.weekId;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------- file + week ---- */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="space-y-4">
          <div>
            <span className="block text-sm font-medium text-zinc-700">
              Tệp Excel (.xls / .xlsx)
            </span>
            <div
              role="button"
              tabIndex={0}
              aria-label="Chọn hoặc kéo thả tệp Excel"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                pickFile(event.dataTransfer.files?.[0]);
              }}
              className={`mt-1 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
                dragOver
                  ? "border-blue-500 bg-blue-50"
                  : file
                    ? "border-emerald-300 bg-emerald-50/50"
                    : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
              }`}
            >
              {file ? (
                <>
                  <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <Icon name="file-spreadsheet" size={16} className="text-emerald-700" />
                    {file.name}
                  </span>
                  <span className="mt-0.5 text-xs text-zinc-500">
                    {formatBytes(file.size)} · bấm để đổi tệp khác
                  </span>
                </>
              ) : (
                <>
                  <Icon name="file-spreadsheet" size={22} className="text-zinc-400" />
                  <span className="mt-1 text-sm font-medium text-zinc-700">
                    Kéo thả tệp vào đây, hoặc bấm để chọn
                  </span>
                  <span className="mt-0.5 text-xs text-zinc-500">
                    Tối đa 10 MB · tệp phải có trang tính tên chứa “TKB”
                  </span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(event) => {
                if (!pickFile(event.target.files?.[0])) event.target.value = "";
              }}
            />
          </div>

          <div>
            <label htmlFor="import-week" className="block text-sm font-medium text-zinc-700">
              Tuần học
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                id="import-week"
                value={weekId}
                onChange={(event) => {
                  setWeekId(event.target.value);
                  setConfirming(false);
                }}
                className="block w-full max-w-xs rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Tự động (tuần hiện tại — chỉ dùng cho xem trước)</option>
                {weeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    Tuần {String(week.weekNo).padStart(2, "0")} ({week.weekStart} → {week.weekEnd})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-500"
                title="Tải file Excel mẫu đã dựng sẵn khung đúng chuẩn nhập khẩu"
              >
                <Icon name="download" size={15} />
                Tải file mẫu
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy !== null || !file}
              onClick={() => void callImport("preview")}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:border-zinc-500 disabled:opacity-50"
            >
              {busy === "preview" ? "Đang xem trước…" : "Xem trước"}
            </button>
            <button
              type="button"
              disabled={busy !== null || !canCommit}
              onClick={() => setConfirming(true)}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                canCommit
                  ? undefined
                  : "Bước 1: chọn tệp + tuần, bấm “Xem trước” và đảm bảo không còn lỗi."
              }
            >
              {busy === "commit" ? "Đang thêm vào..." : "Nhập vào"}
            </button>
          </div>
          {!previewOfCurrentFile && preview ? (
            <p className="text-xs text-amber-700">
              Tệp hoặc tuần đã đổi sau lần xem trước — bấm “Xem trước” lại trước khi nhập.
            </p>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : null}

      {committed ? (
        <section className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          <p className="font-medium">
            Đã nhập khẩu thành công: phiên bản #{committed.version.versionNo} (
            {committed.version.name ?? "không tên"}) với {committed.entryCount} tiết học (trạng
            thái DRAFT).
          </p>
          <p className="mt-1">
            Mã phiên bản: <code className="text-xs">{committed.version.id}</code> —{" "}
            <Link
              href="/admin"
              className="font-medium text-green-800 underline decoration-green-400 underline-offset-2 hover:text-green-950"
            >
              mở trình soạn để kiểm tra và gửi duyệt
            </Link>
            .
          </p>
        </section>
      ) : null}

      {preview ? (
        <>
          {/* ------------------------------------------ summary cards ---- */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold">
                Tuần {String(preview.weekNo).padStart(2, "0")} ({preview.weekStart} → {preview.weekEnd})
              </h2>
              {preview.declaredRange ? (
                <span className="text-xs text-zinc-500">
                  Tệp ghi rõ áp dụng {viShortDate(preview.declaredRange.start)} –{" "}
                  {viShortDate(preview.declaredRange.end)} · trang tính “{preview.sheetName}”
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-800">
                {preview.counts.entries} tiết học
              </span>
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  errorCount > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {errorCount} lỗi
              </span>
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  warningCount > 0 ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {warningCount} cảnh báo
              </span>
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  preview.unmapped.length > 0 ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {preview.unmapped.length} tiết chưa ánh xạ
              </span>
            </div>

            {preview.declaredRange && !preview.weekMatch ? (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">
                  Khoảng ngày trong tệp ({viShortDate(preview.declaredRange.start)} –{" "}
                  {viShortDate(preview.declaredRange.end)}) không nằm trọn trong tuần{" "}
                  {String(preview.weekNo).padStart(2, "0")} đang chọn.
                </p>
                {suggestedWeek ? (
                  <button
                    type="button"
                    onClick={() => {
                      setWeekId(suggestedWeek.id);
                      setConfirming(false);
                    }}
                    className="mt-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    Chuyển sang Tuần {String(suggestedWeek.weekNo).padStart(2, "0")} (
                    {suggestedWeek.weekStart} → {suggestedWeek.weekEnd}) rồi xem trước lại
                  </button>
                ) : (
                  <p className="mt-0.5 text-xs">
                    Không tìm thấy tuần nào khớp khoảng ngày này trong năm học.
                  </p>
                )}
              </div>
            ) : null}

            {summary && preview.counts.entries > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Theo lớp</p>
                  <p className="mt-1 text-sm text-zinc-700">
                    {summary.byClass.map(([name, count]) => `${name}: ${count}`).join(" · ")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Theo ngày</p>
                  <p className="mt-1 text-sm text-zinc-700">
                    {summary.byDay.map(([iso, count]) => `${viShortDate(iso)}: ${count}`).join(" · ")}
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          {/* ---------------------------------------- confirm commit ---- */}
          {confirming && canCommit ? (
            <section className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950">
              <p className="font-semibold">Xác nhận nhập khẩu</p>
              <p className="mt-1">
                Sẽ tạo <strong>bản nháp mới</strong> cho Tuần{" "}
                {String(preview.weekNo).padStart(2, "0")} với{" "}
                <strong>{preview.counts.entries} tiết học</strong>. Lịch đang công bố sẽ{" "}
                <strong>không thay đổi</strong> cho tới khi bản nháp được duyệt và công bố.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void callImport("commit")}
                  className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busy === "commit" ? "Đang nhập…" : "Xác nhận nhập"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100"
                >
                  Huỷ
                </button>
              </div>
            </section>
          ) : null}

          {/* --------------------------------------------- issues ---- */}
          {preview.issues.length > 0 ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">Vấn đề phát hiện</h2>
                <div className="ml-auto flex gap-1 text-xs">
                  {(
                    [
                      ["all", `Tất cả (${preview.counts.issues})`],
                      ["ERROR", `Lỗi (${errorCount})`],
                      ["WARNING", `Cảnh báo (${warningCount})`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setIssueFilter(value)}
                      className={`rounded-full px-2.5 py-1 font-medium ${
                        issueFilter === value
                          ? "bg-zinc-800 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-100">
                    <tr>
                      <th className="px-2 py-1">Mức</th>
                      <th className="px-2 py-1">Loại</th>
                      <th className="px-2 py-1">Nội dung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue, index) => (
                      <tr
                        key={index}
                        className={
                          issue.severity === "ERROR"
                            ? "bg-red-50 text-red-800"
                            : "bg-amber-50 text-amber-800"
                        }
                      >
                        <td className="px-2 py-1 font-medium">
                          {issue.severity === "ERROR" ? "Lỗi" : "Cảnh báo"}
                        </td>
                        <td className="px-2 py-1 font-mono">{issue.type}</td>
                        <td className="px-2 py-1">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* ------------------------------------------- unmapped ---- */}
          {preview.unmapped.length > 0 ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="mb-2 text-base font-semibold">
                Tiết học chưa ánh xạ được ({preview.unmapped.length})
              </h2>
              <p className="mb-2 text-xs text-zinc-500">
                Những dòng này sẽ <strong>không được nhập</strong>. Kiểm tra chính tả trong tệp
                (hoặc bổ sung tên viết tắt của giáo viên trong danh mục) rồi xem trước lại.
              </p>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-100">
                    <tr>
                      <th className="px-2 py-1">Dòng</th>
                      <th className="px-2 py-1">Ngày</th>
                      <th className="px-2 py-1">Lớp</th>
                      <th className="px-2 py-1">Môn</th>
                      <th className="px-2 py-1">GV</th>
                      <th className="px-2 py-1">Gợi ý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.unmapped.map((row, index) => {
                      const hints = [
                        ...row.reasons.map((reason) =>
                          reason === "MISSING_TEACHER" ? "Thiếu cột GV" : reason,
                        ),
                        ...(row.suggestions?.classLabels ?? []).map((label) => `lớp: ${label}`),
                        ...(row.suggestions?.subjectLabels ?? []).map((label) => `môn: ${label}`),
                        ...(row.suggestions?.teacherLabels ?? []).map((label) => `GV: ${label}`),
                      ];
                      return (
                        <tr key={index} className="border-t border-zinc-100">
                          <td className="px-2 py-1">{row.entry.sourceRow}</td>
                          <td className="px-2 py-1">{row.entry.dayLabel}</td>
                          <td className="px-2 py-1">{row.entry.classCode}</td>
                          <td className="px-2 py-1">{row.entry.subjectLabel}</td>
                          <td className="px-2 py-1">{row.entry.teacherAlias || "—"}</td>
                          <td className="px-2 py-1 text-zinc-600">{hints.join(" · ") || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* -------------------------------------------- entries ---- */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Tiết học ({preview.counts.entries})</h2>
              <input
                type="search"
                value={entryQuery}
                onChange={(event) => {
                  setEntryQuery(event.target.value);
                  setShowAllEntries(false);
                }}
                placeholder="Lọc theo lớp, môn, giáo viên, ngày…"
                aria-label="Lọc danh sách tiết học"
                className="ml-auto w-full max-w-xs rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-zinc-100">
                  <tr>
                    <th className="px-2 py-1">Ngày</th>
                    <th className="px-2 py-1">Buổi</th>
                    <th className="px-2 py-1">Tiết</th>
                    <th className="px-2 py-1">Lớp</th>
                    <th className="px-2 py-1">Môn</th>
                    <th className="px-2 py-1">Giáo viên</th>
                    <th className="px-2 py-1">Dòng</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry, index) => (
                    <tr key={index} className="border-t border-zinc-100">
                      <td className="px-2 py-1">{entry.dateIso ?? "?"}</td>
                      <td className="px-2 py-1">{SESSION_LABELS[entry.sessionCode] ?? entry.sessionCode}</td>
                      <td className="px-2 py-1">{entry.periodNo}</td>
                      <td className="px-2 py-1">{entry.className}</td>
                      <td className="px-2 py-1">
                        {entry.subjectName}
                        {entry.subjectComponentName ? ` (${entry.subjectComponentName})` : ""}
                      </td>
                      <td className="px-2 py-1">{entry.teacherName}</td>
                      <td className="px-2 py-1 text-zinc-500">{entry.sourceRow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleEntries.length < matchedEntries.length ? (
              <button
                type="button"
                onClick={() => setShowAllEntries(true)}
                className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-900"
              >
                Hiện tất cả {matchedEntries.length} tiết
              </button>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

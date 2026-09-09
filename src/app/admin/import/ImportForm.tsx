"use client";

import Link from "next/link";
import { useRef, useState } from "react";

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
}

interface PreviewResponse {
  preview: {
    weekId: string;
    weekNo: number;
    weekStart: string;
    weekEnd: string;
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

export default function ImportForm({ weeks }: { weeks: WeekOption[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [weekId, setWeekId] = useState("");
  const [busy, setBusy] = useState<null | "preview" | "commit">(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse["preview"] | null>(null);
  const [committed, setCommitted] = useState<CommitResponse | null>(null);

  async function callImport(mode: "preview" | "commit"): Promise<void> {
    const file = fileInputRef.current?.files?.[0];
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
        setPreview((payload as PreviewResponse).preview);
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

  const firstEntries = preview ? preview.entries.slice(0, 50) : [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="space-y-4">
          <div>
            <label htmlFor="import-file" className="block text-sm font-medium text-zinc-700">
              Tệp Excel (.xls / .xlsx)
            </label>
            <input
              id="import-file"
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-200"
            />
          </div>
          <div>
            <label htmlFor="import-week" className="block text-sm font-medium text-zinc-700">
              Tuần học
            </label>
            <select
              id="import-week"
              value={weekId}
              onChange={(event) => setWeekId(event.target.value)}
              className="mt-1 block w-full max-w-xs rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Tự động (tuần hiện tại — chỉ dùng cho xem trước)</option>
              {weeks.map((week) => (
                <option key={week.id} value={week.id}>
                  Tuần {String(week.weekNo).padStart(2, "0")} ({week.weekStart} → {week.weekEnd})
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void callImport("preview")}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:border-zinc-500 disabled:opacity-50"
            >
              {busy === "preview" ? "Đang xem trước…" : "Xem trước"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void callImport("commit")}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy === "commit" ? "Đang nhập khẩu…" : "Nhập khẩu"}
            </button>
          </div>
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
            <Link href="/admin" className="font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-600">
              quay lại trang quản lý
            </Link>
            .
          </p>
        </section>
      ) : null}

      {preview ? (
        <>
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-base font-semibold">
              Tuần {String(preview.weekNo).padStart(2, "0")} ({preview.weekStart} → {preview.weekEnd})
            </h2>
            <p className="mt-1 text-sm text-zinc-700">
              {preview.counts.entries} tiết học · {preview.counts.issues} vấn đề ·{" "}
              <span className="font-medium text-red-700">{preview.counts.errors} lỗi</span>{" "}
              <span className="text-zinc-500">
                (lỗi sẽ chặn nhập khẩu; cảnh báo thì không)
              </span>
            </p>
          </section>

          {preview.issues.length > 0 ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="mb-2 text-base font-semibold">Vấn đề phát hiện</h2>
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
                    {preview.issues.map((issue, index) => (
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

          {preview.unmapped.length > 0 ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="mb-2 text-base font-semibold">
                Tiết học chưa ánh xạ được ({preview.unmapped.length})
              </h2>
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-100">
                  <tr>
                    <th className="px-2 py-1">Dòng</th>
                    <th className="px-2 py-1">Ngày</th>
                    <th className="px-2 py-1">Lớp</th>
                    <th className="px-2 py-1">Môn</th>
                    <th className="px-2 py-1">GV</th>
                    <th className="px-2 py-1">Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.unmapped.map((row, index) => (
                    <tr key={index} className="border-t border-zinc-100">
                      <td className="px-2 py-1">{row.entry.sourceRow}</td>
                      <td className="px-2 py-1">{row.entry.dayLabel}</td>
                      <td className="px-2 py-1">{row.entry.classCode}</td>
                      <td className="px-2 py-1">{row.entry.subjectLabel}</td>
                      <td className="px-2 py-1">{row.entry.teacherAlias || "—"}</td>
                      <td className="px-2 py-1 font-mono">{row.reasons.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 text-base font-semibold">
              Tiết học{firstEntries.length < preview.entries.length
                ? ` (50/${preview.entries.length} đầu tiên)`
                : ""}
            </h2>
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
                  {firstEntries.map((entry, index) => (
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
          </section>
        </>
      ) : null}
    </div>
  );
}

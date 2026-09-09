"use client";

import type { IssueItem, ValidateReport } from "./api";
import { Icon } from "@/components/ui/icon";

interface Props {
  report: ValidateReport;
  onLocate: (entryIds: string[] | string | undefined) => void;
  onClose: () => void;
}

function IssueRow({
  issue,
  tone,
  onLocate,
}: {
  issue: IssueItem;
  tone: "error" | "warning";
  onLocate: Props["onLocate"];
}) {
  const ids =
    (issue.details.entryIds as string[] | undefined) ??
    (issue.details.entryId as string | undefined);
  return (
    <li
      className={`rounded-md border px-3 py-2 text-xs ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span>{issue.message}</span>
        {ids && (
          <button
            type="button"
            onClick={() => onLocate(ids)}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium underline-offset-2 transition-colors hover:bg-white/60 hover:underline"
          >
            Xem tiết
          </button>
        )}
      </div>
      <span className="mt-0.5 block text-[10px] uppercase tracking-wide opacity-60">
        {issue.code}
      </span>
    </li>
  );
}

export function IssuesPanel({ report, onLocate, onClose }: Props) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          Kết quả kiểm tra
          <span className="mt-0.5 block text-xs font-normal text-zinc-500">
            {report.counts.errors} lỗi nặng · {report.counts.warnings} cảnh báo ·{" "}
            {report.workloadIssues.length} tải trọng
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

      <div className="max-h-[60vh] space-y-2 overflow-y-auto">
        {report.errors.length === 0 &&
          report.warnings.length === 0 &&
          report.workloadIssues.length === 0 && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Không phát hiện vấn đề gì.
            </p>
          )}
        {report.errors.map((issue, i) => (
          <IssueRow key={`e${i}`} issue={issue} tone="error" onLocate={onLocate} />
        ))}
        {report.warnings.slice(0, 50).map((issue, i) => (
          <IssueRow key={`w${i}`} issue={issue} tone="warning" onLocate={onLocate} />
        ))}
        {report.workloadIssues.slice(0, 50).map((issue, i) => (
          <IssueRow key={`wl${i}`} issue={issue} tone="warning" onLocate={onLocate} />
        ))}
      </div>
    </div>
  );
}

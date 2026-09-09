import { formatDateTimeVi } from "./format";
import type { VersionDto } from "./api";
import { VersionActions } from "./VersionActions";

const VERSION_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  DRAFT: { label: "Bản nháp", badgeClass: "bg-zinc-200 text-zinc-600" },
  REVIEW: { label: "Chờ duyệt", badgeClass: "bg-amber-100 text-amber-900" },
  APPROVED: { label: "Đã duyệt", badgeClass: "bg-blue-100 text-blue-800" },
  PUBLISHED: { label: "Đã công bố", badgeClass: "bg-emerald-100 text-emerald-800" },
  ARCHIVED: { label: "Lưu trữ", badgeClass: "bg-zinc-200 text-zinc-500" },
};

interface VersionListProps {
  versions: VersionDto[];
  canApprove: boolean;
  canPublish: boolean;
}

export function VersionList({ versions, canApprove, canPublish }: VersionListProps) {
  return (
    <ul className="space-y-3">
      {versions.map((version) => {
        const meta = VERSION_STATUS_META[version.status] ?? {
          label: version.status,
          badgeClass: "bg-zinc-200 text-zinc-600",
        };
        const timeline: { label: string; value: string }[] = [];
        if (version.createdAt) {
          timeline.push({ label: "Tạo", value: version.createdAt });
        }
        if (version.submittedAt) {
          timeline.push({ label: "Gửi duyệt", value: version.submittedAt });
        }
        if (version.approvedAt) {
          timeline.push({ label: "Duyệt", value: version.approvedAt });
        }
        if (version.publishedAt) {
          timeline.push({ label: "Công bố", value: version.publishedAt });
        }
        return (
          <li
            key={version.id}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">
                    {version.name ?? `Phiên bản ${version.versionNo}`}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}
                  >
                    {meta.label}
                  </span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {`Số hiệu ${version.versionNo} · lần sửa ${version.revision} · ${version.entryCount} tiết`}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {timeline
                    .map((item) => `${item.label}: ${formatDateTimeVi(item.value)}`)
                    .join(" · ")}
                </p>
              </div>
              {version.status === "REVIEW" && canApprove ? (
                <VersionActions
                  versionId={version.id}
                  action="approve"
                  label="Phê duyệt"
                />
              ) : null}
              {version.status === "APPROVED" && canPublish ? (
                <VersionActions
                  versionId={version.id}
                  action="publish"
                  label="Công bố"
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

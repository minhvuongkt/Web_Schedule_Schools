import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  apiErrorToMessage,
  apiFetch,
  type AuditLogResponse,
} from "@/components/leadership/api";
import { ErrorBanner } from "@/components/leadership/ErrorBanner";
import { formatDateTimeVi } from "@/components/leadership/format";
import { AppShell } from "@/components/site/app-shell";
import { requireUser } from "@/server/auth/session";
import { can } from "@/server/domain/roles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nhật ký thao tác — Măng Cành",
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: "TimetableVersion", label: "Phiên bản thời khóa biểu" },
  { value: "TimetableEntry", label: "Tiết học" },
  { value: "TeachingAssignment", label: "Phân công giảng dạy" },
  { value: "Substitution", label: "Dạy thay" },
  { value: "MakeupLesson", label: "Dạy bù" },
  { value: "Teacher", label: "Giáo viên (danh mục)" },
  { value: "Subject", label: "Môn học (danh mục)" },
  { value: "SubjectComponent", label: "Phân môn (danh mục)" },
  { value: "Room", label: "Phòng học (danh mục)" },
  { value: "User", label: "Người dùng" },
  { value: "Notification", label: "Thông báo" },
  { value: "Export", label: "Xuất dữ liệu" },
];

const ENTITY_TYPE_LABELS_VI = new Map(
  ENTITY_TYPES.map((option) => [option.value, option.label]),
);

const ACTION_META: Record<string, { label: string; badgeClass: string }> = {
  CREATE: { label: "Tạo", badgeClass: "bg-emerald-100 text-emerald-800" },
  UPDATE: { label: "Cập nhật", badgeClass: "bg-amber-100 text-amber-900" },
  DELETE: { label: "Xóa", badgeClass: "bg-amber-100 text-amber-900" },
  MOVE: { label: "Di chuyển", badgeClass: "bg-amber-100 text-amber-900" },
  IMPORT: { label: "Nhập", badgeClass: "bg-zinc-200 text-zinc-700" },
  EXPORT: { label: "Xuất", badgeClass: "bg-zinc-200 text-zinc-700" },
  LOGIN: { label: "Đăng nhập", badgeClass: "bg-zinc-200 text-zinc-700" },
  SUBMIT_REVIEW: { label: "Gửi duyệt", badgeClass: "bg-blue-100 text-blue-800" },
  APPROVE: { label: "Phê duyệt", badgeClass: "bg-blue-100 text-blue-800" },
  PUBLISH: { label: "Công bố", badgeClass: "bg-blue-100 text-blue-800" },
  ROLLBACK: { label: "Khôi phục", badgeClass: "bg-blue-100 text-blue-800" },
  SUBSTITUTE: { label: "Dạy thay", badgeClass: "bg-blue-100 text-blue-800" },
  MAKEUP: { label: "Bổ sung tiết", badgeClass: "bg-blue-100 text-blue-800" },
  NOTIFY: { label: "Gửi thông báo", badgeClass: "bg-indigo-100 text-indigo-800" },
};

const FALLBACK_ACTION_META = { label: "", badgeClass: "bg-zinc-200 text-zinc-700" };

interface PageProps {
  searchParams: Promise<{
    entityType?: string | string[];
    limit?: string | string[];
    offset?: string | string[];
  }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const user = await requireUser("/admin/audit");
  if (!can(user.role, "audit:read")) {
    redirect("/khong-co-quyen?ly-do=sai-vai-tro");
  }

  const params = await searchParams;
  const entityTypeParam = firstParam(params.entityType);
  const entityType =
    entityTypeParam !== undefined && ENTITY_TYPE_LABELS_VI.has(entityTypeParam)
      ? entityTypeParam
      : undefined;
  const limit = Math.min(
    parseNonNegativeInt(firstParam(params.limit), DEFAULT_LIMIT) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const offset = parseNonNegativeInt(firstParam(params.offset), 0);

  const cookieStore = await cookies();
  const cookie = cookieStore.toString();

  const query = new URLSearchParams();
  if (entityType) {
    query.set("entityType", entityType);
  }
  query.set("limit", String(limit));
  query.set("offset", String(offset));

  let entries: AuditLogResponse["entries"] | null = null;
  let error: string | null = null;
  try {
    entries = (
      await apiFetch<AuditLogResponse>(`/api/audit?${query.toString()}`, { cookie })
    ).entries;
  } catch (caught) {
    error = apiErrorToMessage(caught, "/admin/audit");
  }

  const hasPrev = offset > 0;
  const hasNext = entries !== null && entries.length === limit;

  function pageHref(nextOffset: number): string {
    const hrefQuery = new URLSearchParams();
    if (entityType) {
      hrefQuery.set("entityType", entityType);
    }
    hrefQuery.set("limit", String(limit));
    hrefQuery.set("offset", String(nextOffset));
    return `/admin/audit?${hrefQuery.toString()}`;
  }

  return (
    <AppShell page="Nhật ký thao tác" user={user}>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Nhật ký thao tác
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Các thao tác đã thực hiện trên hệ thống, mới nhất trước.
          </p>
        </header>

          <form
            method="get"
            action="/admin/audit"
            className="mb-4 flex flex-wrap items-end gap-3"
          >
            <div>
              <label
                htmlFor="entityType"
                className="block text-sm font-medium text-zinc-700"
              >
                Đối tượng
              </label>
              <select
                id="entityType"
                name="entityType"
                defaultValue={entityType ?? ""}
                className="mt-1 block w-64 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="">Tất cả</option>
                {ENTITY_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
            >
              Lọc
            </button>
            {entityType ? (
              <Link
                href="/admin/audit"
                className="text-sm font-medium text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-800 hover:underline"
              >
                Xóa lọc
              </Link>
            ) : null}
          </form>

          {error ? (
            <ErrorBanner message={error} />
          ) : entries && entries.length > 0 ? (
            <>
              <div className="overflow-x-auto [&_table]:min-w-2xl">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-500"
                      >
                        Thời gian
                      </th>
                      <th
                        scope="col"
                        className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-500"
                      >
                        Người thực hiện
                      </th>
                      <th
                        scope="col"
                        className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-500"
                      >
                        Hành động
                      </th>
                      <th
                        scope="col"
                        className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-500"
                      >
                        Đối tượng
                      </th>
                      <th
                        scope="col"
                        className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-500"
                      >
                        Lý do
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const actionMeta = ACTION_META[entry.action] ?? {
                        ...FALLBACK_ACTION_META,
                        label: entry.action,
                      };
                      return (
                        <tr key={entry.id} className="bg-white">
                          <td className="whitespace-nowrap border border-zinc-200 px-3 py-2 text-zinc-600">
                            <time dateTime={entry.createdAt}>
                              {formatDateTimeVi(entry.createdAt)}
                            </time>
                          </td>
                          <td className="border border-zinc-200 px-3 py-2 font-medium text-zinc-900">
                            {entry.actorName ?? "—"}
                          </td>
                          <td className="whitespace-nowrap border border-zinc-200 px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionMeta.badgeClass}`}
                            >
                              {actionMeta.label}
                            </span>
                          </td>
                          <td className="border border-zinc-200 px-3 py-2">
                            <span className="block text-zinc-900">
                              {ENTITY_TYPE_LABELS_VI.get(entry.entityType) ??
                                entry.entityType}
                            </span>
                            {entry.entityId ? (
                              <span className="block font-mono text-xs text-zinc-400">
                                {entry.entityId}
                              </span>
                            ) : null}
                          </td>
                          <td className="border border-zinc-200 px-3 py-2 text-zinc-600">
                            {entry.reason ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <p className="text-zinc-500">
                  {`Mục ${offset + 1}–${offset + entries.length}`}
                </p>
                <div className="flex gap-2">
                  {hasPrev ? (
                    <Link
                      href={pageHref(Math.max(0, offset - limit))}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
                    >
                      Trang trước
                    </Link>
                  ) : null}
                  {hasNext ? (
                    <Link
                      href={pageHref(offset + limit)}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
                    >
                      Trang sau
                    </Link>
                  ) : null}
                </div>
              </div>
            </>
           ) : (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
              Chưa có bản ghi nào khớp bộ lọc.
            </p>
          )}
        </div>
    </AppShell>
  );
}

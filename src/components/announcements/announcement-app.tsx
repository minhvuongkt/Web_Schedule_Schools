"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { roleLabelVi } from "@/components/leadership/labels";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import {
  AUDIENCES,
  AUDIENCE_LABELS_VI,
  type Audience,
} from "@/server/domain/notification-audience";
import type {
  AnnouncementRow,
  SelectableRecipient,
} from "@/server/services/announcement.service";

/**
 * Broadcast announcements (/admin/thong-bao). Teachers receive in-app
 * notifications + Web Push; students see class announcements in the /hsv
 * handbook. "Người nhận được chọn" sends only to explicitly picked accounts.
 */

const TITLE_MAX = 120;
const BODY_MAX = 1000;

const AUDIENCE_HINTS: Record<Audience, string> = {
  TEACHERS:
    "Mọi tài khoản giáo viên và ban giám hiệu đang hoạt động. Họ nhận thông báo trong mục “Thông báo” và trên điện thoại (nếu đã bật thông báo đẩy).",
  STUDENTS:
    "Hiển thị trong sổ tay học sinh (/hsv → Thông báo) cho tất cả các lớp. Tài khoản học sinh/phụ huynh (nếu có) cũng nhận thông báo trong ứng dụng.",
  ALL: "Cả giáo viên, ban giám hiệu và toàn bộ học sinh — kết hợp hai hình thức trên.",
  SELECTED:
    "Chỉ những tài khoản được tích chọn bên dưới nhận thông báo (kèm thông báo đẩy nếu họ đã bật).",
};

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

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function AnnouncementApp() {
  const [audience, setAudience] = useState<Audience>("TEACHERS");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recent, setRecent] = useState<AnnouncementRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [selectedAnnouncementIds, setSelectedAnnouncementIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [recipientOptions, setRecipientOptions] = useState<SelectableRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const recipientsRequested = useRef(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadRecent = useCallback(async () => {
    const data = await api<{ announcements: AnnouncementRow[] }>(
      "/api/announcements?limit=20",
    );
    setRecent(data.announcements);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<{ announcements: AnnouncementRow[] }>(
          "/api/announcements?limit=20",
        );
        if (!cancelled) setRecent(data.announcements);
      } catch {
        /* the form still works without history */
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the pickable accounts lazily, the first time SELECTED is chosen.
  // The ref guard keeps this to one fetch per attempt; a failed attempt is
  // retried only via the explicit "Thử lại" button (retryTick). The effect
  // intentionally does not cancel its own fetch: changing local state here
  // must never abort the in-flight request.
  useEffect(() => {
    if (audience !== "SELECTED" || recipientsRequested.current) return;
    recipientsRequested.current = true;
    void (async () => {
      setRecipientsLoading(true);
      setRecipientsError(null);
      try {
        const data = await api<{ recipients: SelectableRecipient[] }>(
          "/api/announcements/recipients",
        );
        setRecipientOptions(data.recipients);
      } catch (e) {
        setRecipientsError(
          e instanceof Error ? e.message : "Không tải được danh sách người nhận.",
        );
      } finally {
        setRecipientsLoading(false);
      }
    })();
  }, [audience, retryTick]);

  function retryRecipients() {
    recipientsRequested.current = false;
    setRetryTick((tick) => tick + 1);
  }

  const filteredRecipients = useMemo(() => {
    const needle = normalizeSearch(recipientSearch.trim());
    if (!needle) return recipientOptions;
    return recipientOptions.filter((r) =>
      [r.displayName, r.username, r.teacherCode ?? "", roleLabelVi(r.role)]
        .map(normalizeSearch)
        .some((haystack) => haystack.includes(needle)),
    );
  }, [recipientOptions, recipientSearch]);

  function toggleRecipient(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of filteredRecipients) next.add(r.id);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api<{ announcement: AnnouncementRow }>("/api/announcements", {
        method: "POST",
        body: JSON.stringify({
          audience,
          title,
          body,
          ...(audience === "SELECTED" ? { userIds: [...selectedIds] } : {}),
        }),
      });
      const sent = data.announcement;
      const parts = [`${sent.recipientCount} tài khoản`];
      if (sent.classCount > 0) parts.push(`${sent.classCount} lớp`);
      setNotice(`Đã gửi tới ${parts.join(" và ")}.`);
      setTitle("");
      setBody("");
      if (audience === "SELECTED") setSelectedIds(new Set());
      await loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được thông báo.");
    } finally {
      setSending(false);
    }
  }

  const selectedCount = selectedIds.size;
  const sendDisabled =
    sending ||
    title.trim().length < 2 ||
    body.trim().length < 1 ||
    (audience === "SELECTED" && selectedCount === 0);

  function toggleAnnouncement(id: string) {
    setSelectedAnnouncementIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (deleting || selectedAnnouncementIds.size === 0) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await api<{ deleted: number; classNotices: number }>(
        "/api/announcements",
        {
          method: "DELETE",
          body: JSON.stringify({ ids: [...selectedAnnouncementIds] }),
        },
      );
      const parts = [`${result.deleted} thông báo`];
      if (result.classNotices > 0) parts.push(`${result.classNotices} thông báo lớp`);
      setNotice(`Đã xóa ${parts.join(" và ")} khỏi tất cả người nhận.`);
      setSelectedAnnouncementIds(new Set());
      setDeleteConfirmOpen(false);
      await loadRecent();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Không xóa được thông báo.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Gửi thông báo
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Soạn thông báo chung gửi tới giáo viên, học sinh, toàn trường hoặc
          chọn từng người nhận cụ thể. Giáo viên nhận ngay trong mục Thông báo
          và trên điện thoại; học sinh xem trong sổ tay điện tử.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-700">
            Gửi cho ai?
          </legend>
          <div className="space-y-2">
            {AUDIENCES.map((option) => {
              const active = audience === option;
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    active
                      ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600"
                      : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="audience"
                    value={option}
                    checked={active}
                    onChange={() => setAudience(option)}
                    className="mt-1 h-4 w-4 accent-blue-700"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-zinc-900">
                      {AUDIENCE_LABELS_VI[option]}
                      {option === "SELECTED" && active && selectedCount > 0 ? (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                          {selectedCount} đã chọn
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                      {AUDIENCE_HINTS[option]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {audience === "SELECTED" ? (
          <div
            aria-label="Danh sách người nhận"
            className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-zinc-600">
                Đã chọn {selectedCount} người nhận
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  disabled={filteredRecipients.length === 0}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  Chọn tất cả đang hiện
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={selectedCount === 0}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-rose-400 hover:text-rose-700 disabled:opacity-50"
                >
                  Bỏ chọn hết
                </button>
              </div>
            </div>
            <label className="mt-2 block">
              <span className="sr-only">Tìm người nhận</span>
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="Tìm theo tên, tài khoản hoặc mã giáo viên…"
                type="search"
              />
            </label>
            {recipientsError ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p role="alert" className="text-xs text-rose-700">
                  {recipientsError}
                </p>
                <button
                  type="button"
                  onClick={retryRecipients}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-600 hover:text-blue-700"
                >
                  Thử lại
                </button>
              </div>
            ) : recipientsLoading ? (
              <p className="mt-3 text-center text-xs text-zinc-500">Đang tải danh sách…</p>
            ) : (
              <ul className="mt-2 max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
                {filteredRecipients.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleRecipient(r.id)}
                        className="h-4 w-4 shrink-0 accent-blue-700"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900">
                          {r.displayName}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {roleLabelVi(r.role)}
                          {r.teacherCode ? ` · ${r.teacherCode}` : ""} · {r.username}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
                {filteredRecipients.length === 0 ? (
                  <li className="px-3 py-4 text-center text-xs text-zinc-500">
                    Không tìm thấy người nhận phù hợp.
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-zinc-700">
            Tiêu đề
            <span
              className={`text-xs font-normal ${
                title.length > TITLE_MAX ? "text-rose-600" : "text-zinc-400"
              }`}
            >
              {title.length}/{TITLE_MAX}
            </span>
          </span>
          <input
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ví dụ: Nghỉ học ngày 15/9 do bão"
            required
            minLength={2}
            maxLength={TITLE_MAX}
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-zinc-700">
            Nội dung
            <span
              className={`text-xs font-normal ${
                body.length > BODY_MAX ? "text-rose-600" : "text-zinc-400"
              }`}
            >
              {body.length}/{BODY_MAX}
            </span>
          </span>
          <textarea
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Nội dung chi tiết của thông báo…"
            required
            minLength={1}
            maxLength={BODY_MAX}
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sendDisabled}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="send" size={15} />
            {sending ? "Đang gửi…" : "Gửi thông báo"}
          </button>
        </div>
      </form>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-700">
            Đã gửi gần đây
          </h2>
          {recent.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">
                Đã chọn {selectedAnnouncementIds.size}
              </span>
              <button
                type="button"
                disabled={selectedAnnouncementIds.size === 0}
                onClick={() => {
                  setDeleteError(null);
                  setDeleteConfirmOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:border-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="trash-2" size={13} />
                Xóa đã chọn
              </button>
            </div>
          ) : null}
        </div>
        {loadingRecent ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            Đang tải…
          </p>
        ) : recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            Chưa gửi thông báo nào.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedAnnouncementIds.has(item.id)}
                    onChange={() => toggleAnnouncement(item.id)}
                    className="h-4 w-4 shrink-0 accent-rose-600"
                    aria-label={`Chọn thông báo: ${item.title}`}
                  />
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                    {AUDIENCE_LABELS_VI[item.audience]}
                  </span>
                  <time
                    dateTime={item.createdAt}
                    className="ml-auto text-xs text-zinc-500"
                  >
                    {formatDateTime(item.createdAt)}
                  </time>
                </div>
                <h3 className="mt-1.5 text-sm font-semibold text-zinc-900">
                  {item.title}
                </h3>
                <p className="mt-1 whitespace-pre-line text-sm text-zinc-600">
                  {item.body}
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  {item.recipientCount} tài khoản
                  {item.classCount > 0 ? ` · ${item.classCount} lớp` : ""}
                </p>
                {item.recipientNames.length > 0 ? (
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {item.recipientNames.slice(0, 5).join(", ")}
                    {item.recipientNames.length > 5 ? "…" : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleteConfirmOpen ? (
        <Modal title="Xóa thông báo đã chọn?" onClose={() => setDeleteConfirmOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p className="font-semibold">Thao tác này không thể hoàn tác.</p>
              <p className="mt-1">
                {selectedAnnouncementIds.size} thông báo sẽ bị xóa khỏi hộp thư
                của toàn bộ người nhận — kể cả thông báo lớp trong sổ tay học
                sinh. Nhật ký thao tác vẫn được giữ lại.
              </p>
            </div>
            {deleteError ? (
              <p role="alert" className="text-sm text-rose-700">
                {deleteError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteSelected()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="trash-2" size={15} />
                {deleting
                  ? "Đang xóa…"
                  : `Xóa ${selectedAnnouncementIds.size} thông báo`}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

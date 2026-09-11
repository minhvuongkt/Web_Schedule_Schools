"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Icon } from "@/components/ui/icon";
import {
  AUDIENCES,
  AUDIENCE_LABELS_VI,
  type Audience,
} from "@/server/domain/notification-audience";
import type { AnnouncementRow } from "@/server/services/announcement.service";

/**
 * Broadcast announcements (/admin/thong-bao). Teachers receive in-app
 * notifications + Web Push; students see class announcements in the /hsv
 * handbook. The recent list comes from the send record (payload counts).
 */

const TITLE_MAX = 120;
const BODY_MAX = 1000;

const AUDIENCE_HINTS: Record<Audience, string> = {
  TEACHERS:
    "Mọi tài khoản giáo viên và ban giám hiệu đang hoạt động. Họ nhận thông báo trong mục “Thông báo” và trên điện thoại (nếu đã bật thông báo đẩy).",
  STUDENTS:
    "Hiển thị trong sổ tay học sinh (/hsv → Thông báo) cho tất cả các lớp. Tài khoản học sinh/phụ huynh (nếu có) cũng nhận thông báo trong ứng dụng.",
  ALL: "Cả giáo viên, ban giám hiệu và toàn bộ học sinh — kết hợp hai hình thức trên.",
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

export function AnnouncementApp() {
  const [audience, setAudience] = useState<Audience>("TEACHERS");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recent, setRecent] = useState<AnnouncementRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api<{ announcement: AnnouncementRow }>("/api/announcements", {
        method: "POST",
        body: JSON.stringify({ audience, title, body }),
      });
      const sent = data.announcement;
      const parts = [`${sent.recipientCount} tài khoản`];
      if (sent.classCount > 0) parts.push(`${sent.classCount} lớp`);
      setNotice(`Đã gửi tới ${parts.join(" và ")}.`);
      setTitle("");
      setBody("");
      await loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được thông báo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Gửi thông báo
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Soạn thông báo chung gửi tới giáo viên, học sinh hoặc toàn trường.
          Giáo viên nhận ngay trong mục Thông báo và trên điện thoại; học sinh
          xem trong sổ tay điện tử.
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
            disabled={sending || title.trim().length < 2 || body.trim().length < 1}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="send" size={15} />
            {sending ? "Đang gửi…" : "Gửi thông báo"}
          </button>
        </div>
      </form>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700">
          Đã gửi gần đây
        </h2>
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell } from "@/components/site/app-shell";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { roleLabelVi } from "@/components/leadership/labels";
import type { Role } from "@/server/domain/roles";
import type { UserRow } from "@/server/services/user.service";

/**
 * User account management (/admin/tai-khoan, users:manage = SUPER_ADMIN).
 * Creates accounts, edits profile/role/teacher-link, resets passwords and
 * deactivates users. Usernames are immutable; deactivation revokes sessions.
 * Emails are teacher-owned: admins never set them — each user enters and
 * code-verifies their own address in the first-login wizard / account page.
 */

interface TeacherOption {
  id: string;
  code: string;
  fullName: string;
  linkedUserId: string | null;
}

const ROLE_OPTIONS = [
  "SUPER_ADMIN",
  "TIMETABLE_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "STUDENT",
  "PARENT",
] as const;

const ROLE_TONES: Record<string, string> = {
  SUPER_ADMIN: "bg-rose-100 text-rose-800",
  TIMETABLE_ADMIN: "bg-blue-100 text-blue-800",
  PRINCIPAL: "bg-violet-100 text-violet-800",
  TEACHER: "bg-emerald-100 text-emerald-800",
  STUDENT: "bg-zinc-100 text-zinc-600",
  PARENT: "bg-zinc-100 text-zinc-600",
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const time = iso.split("T")[1] ?? "";
  return time
    ? `${d}/${m}/${y} ${time.slice(0, 5)}`
    : `${d}/${m}/${y}`;
}

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

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-400">{hint}</span> : null}
    </label>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ROLE_TONES[role] ?? "bg-zinc-100 text-zinc-600"
      }`}
    >
      {roleLabelVi(role)}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-zinc-400"}`}
      />
      {isActive ? "Hoạt động" : "Đã khóa"}
    </span>
  );
}

function OnboardingBadge({ completed }: { completed: boolean }) {
  if (completed) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
      title="Chưa hoàn tất thiết lập lần đầu: người dùng sẽ nhập email và đặt mật khẩu riêng ở lần đăng nhập tới."
    >
      <Icon name="key-round" size={10} />
      Chưa thiết lập
    </span>
  );
}

export function UsersApp({ user }: { user: { displayName: string; role: Role } }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(
    null,
  );

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const load = useCallback(async () => {
    const data = await api<{ users: UserRow[]; teachers: TeacherOption[] }>("/api/users");
    setUsers(data.users);
    setTeachers(data.teachers);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<{ users: UserRow[]; teachers: TeacherOption[] }>("/api/users");
        if (cancelled) return;
        setUsers(data.users);
        setTeachers(data.teachers);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Không tải được danh sách tài khoản.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<void>, successMessage: string) {
    setSaving(true);
    setError(null);
    try {
      await action();
      flash(successMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell page="Tài khoản" user={user}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Tài khoản người dùng
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Cấp tài khoản đăng nhập, gán vai trò và đặt lại mật khẩu cho giáo
            viên, ban giám hiệu và quản trị viên. Email liên hệ do mỗi người tự
            nhập và xác nhận mã ở lần đăng nhập đầu tiên.
          </p>
        </header>

        {error ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm text-zinc-500">
            {users.length} tài khoản · {users.filter((u) => u.isActive).length} đang hoạt động
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-blue-800 active:scale-95"
          >
            <Icon name="plus" size={15} />
            Thêm tài khoản
          </button>
        </div>

        {loading ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            Đang tải…
          </p>
        ) : (
          <>
            {/* Mobile: cards */}
            <ul className="space-y-2 md:hidden">
              {users.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {row.displayName}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-500">{row.username}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge isActive={row.isActive} />
                      <OnboardingBadge completed={row.onboardingCompleted} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <RoleBadge role={row.role} />
                    {row.teacher ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                        {row.teacher.fullName} ({row.teacher.code})
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">
                    Đăng nhập cuối: {row.lastLoginAt ? formatDate(row.lastLoginAt) : "chưa bao giờ"}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditTarget(row)}
                      className="min-h-11 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-600 hover:text-blue-700 active:scale-95"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run(async () => {
                          const result = await api<{ newPassword: string }>(
                            `/api/users/${row.id}/reset-password`,
                            { method: "POST", body: JSON.stringify({}) },
                          );
                          setResetResult({ username: row.username, password: result.newPassword });
                        }, "Đã đặt lại mật khẩu — người dùng sẽ tự thiết lập lại ở lần đăng nhập tới.")
                      }
                      className="min-h-11 rounded-lg border border-amber-200 px-2.5 text-xs font-medium text-amber-700 transition-colors hover:border-amber-400 active:scale-95"
                    >
                      Đặt lại mật khẩu
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        run(async () => {
                          await api(`/api/users/${row.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ isActive: !row.isActive }),
                          });
                          await load();
                        }, row.isActive ? "Đã khóa tài khoản." : "Đã mở lại tài khoản.")
                      }
                      className={`min-h-11 rounded-lg border px-2.5 text-xs font-medium transition-colors active:scale-95 ${
                        row.isActive
                          ? "border-rose-200 text-rose-700 hover:border-rose-400"
                          : "border-emerald-200 text-emerald-700 hover:border-emerald-400"
                      }`}
                    >
                      {row.isActive ? "Khóa" : "Mở"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setDeleteTarget(row)}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 transition-colors hover:border-rose-500 active:scale-95"
                    >
                      <Icon name="trash-2" size={14} />
                      Xóa
                    </button>
                  </div>
                </li>
              ))}
              {users.length === 0 ? (
                <li className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                  Chưa có tài khoản nào.
                </li>
              ) : null}
            </ul>

            {/* ≥md: table */}
            <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm md:block [&>table]:min-w-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-3 font-medium">Tên hiển thị</th>
                    <th className="px-4 py-3 font-medium">Đăng nhập</th>
                    <th className="px-4 py-3 font-medium">Vai trò</th>
                    <th className="px-4 py-3 font-medium">Gắn giáo viên</th>
                    <th className="px-4 py-3 font-medium">Đăng nhập cuối</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        {row.displayName}
                        {row.email ? (
                          <span className="block text-xs font-normal text-zinc-400">
                            {row.email}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                        {row.username}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={row.role} />
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {row.teacher ? `${row.teacher.fullName} (${row.teacher.code})` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {row.lastLoginAt ? formatDate(row.lastLoginAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge isActive={row.isActive} />
                          <OnboardingBadge completed={row.onboardingCompleted} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditTarget(row)}
                            className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-blue-600 hover:text-blue-700"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              run(async () => {
                                const result = await api<{ newPassword: string }>(
                                  `/api/users/${row.id}/reset-password`,
                                  { method: "POST", body: JSON.stringify({}) },
                                );
                                setResetResult({
                                  username: row.username,
                                  password: result.newPassword,
                                });
                              }, "Đã đặt lại mật khẩu — người dùng sẽ tự thiết lập lại ở lần đăng nhập tới.")
                            }
                            className="rounded-md border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:border-amber-400"
                          >
                            Mật khẩu
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              run(async () => {
                                await api(`/api/users/${row.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ isActive: !row.isActive }),
                                });
                                await load();
                              }, row.isActive ? "Đã khóa tài khoản." : "Đã mở lại tài khoản.")
                            }
                            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                              row.isActive
                                ? "border-rose-200 text-rose-700 hover:border-rose-400"
                                : "border-emerald-200 text-emerald-700 hover:border-emerald-400"
                            }`}
                          >
                            {row.isActive ? "Khóa" : "Mở"}
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setDeleteTarget(row)}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:border-rose-500"
                          >
                            <Icon name="trash-2" size={13} />
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="mt-6 text-xs text-zinc-400">
          Khóa tài khoản sẽ đăng xuất ngay lập tức mọi phiên của người dùng.
          Hệ thống luôn duy trì ít nhất một SUPER_ADMIN đang hoạt động. Tài
          khoản bị khóa không bị xóa: lịch sử thao tác và thông báo vẫn được
          bảo toàn. Xóa tài khoản là vĩnh viễn và không thể hoàn tác — chỉ nên
          dùng khi tài khoản được tạo nhầm.
        </p>
      </div>

      {createOpen ? (
        <UserCreateModal
          teachers={teachers}
          saving={saving}
          onClose={() => setCreateOpen(false)}
          onSubmit={(data) =>
            run(async () => {
              const result = await api<{ user: UserRow }>("/api/users", {
                method: "POST",
                body: JSON.stringify(data),
              });
              setCreateOpen(false);
              setResetResult({ username: result.user.username, password: data.password });
              await load();
            }, "Đã tạo tài khoản.")
          }
        />
      ) : null}

      {editTarget ? (
        <UserEditModal
          initial={editTarget}
          teachers={teachers}
          saving={saving}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) =>
            run(async () => {
              await api(`/api/users/${editTarget.id}`, {
                method: "PATCH",
                body: JSON.stringify(data),
              });
              setEditTarget(null);
              await load();
            }, "Đã lưu thông tin tài khoản.")
          }
        />
      ) : null}

      {deleteTarget ? (
        <UserDeleteModal
          target={deleteTarget}
          saving={saving}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() =>
            run(async () => {
              await api(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
              setDeleteTarget(null);
              await load();
            }, "Đã xóa tài khoản vĩnh viễn.")
          }
        />
      ) : null}

      {resetResult ? (
        <Modal
          title="Mật khẩu mới"
          onClose={() => setResetResult(null)}
        >
          <p className="text-sm text-zinc-600">
            Mật khẩu cho tài khoản{" "}
            <span className="font-mono font-semibold text-zinc-900">
              {resetResult.username}
            </span>
            :
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-sm font-semibold text-zinc-900">
              {resetResult.password}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(resetResult.password);
                flash("Đã sao chép mật khẩu.");
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-600 hover:text-blue-700 active:scale-95"
            >
              <Icon name="copy" size={14} />
              Sao chép
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Mọi phiên đăng nhập hiện tại của tài khoản này đã bị thu hồi. Chỉ
            hiển thị một lần — hãy gửi cho người dùng qua kênh an toàn.
          </p>
        </Modal>
      ) : null}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

function UserDeleteModal({
  target,
  saving,
  onClose,
  onConfirm,
}: {
  target: UserRow;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim() === target.username;

  return (
    <Modal title="Xóa tài khoản" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold">Thao tác này không thể hoàn tác.</p>
          <p className="mt-1">
            Tài khoản <span className="font-mono font-semibold">{target.username}</span> (
            {target.displayName}) sẽ bị xóa vĩnh viễn: mọi phiên đăng nhập và đăng
            ký thông báo đẩy bị thu hồi. Nhật ký thao tác vẫn được giữ lại.
          </p>
          <p className="mt-1">
            Nếu chỉ muốn ngăn đăng nhập tạm thời, hãy dùng{" "}
            <span className="font-semibold">Khóa</span> thay vì xóa.
          </p>
        </div>
        <Field
          label={`Nhập "${target.username}" để xác nhận`}
          hint="Chính xác từng ký tự, phân biệt chữ thường."
        >
          <input
            className={inputClass}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!confirmed || saving}
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="trash-2" size={15} />
            Xóa vĩnh viễn
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface UserFormData {
  username: string;
  displayName: string;
  password: string;
  role: string;
  teacherId: string | null;
}

function UserCreateModal({
  teachers,
  saving,
  onClose,
  onSubmit,
}: {
  teachers: TeacherOption[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: UserFormData) => void;
}) {
  const [form, setForm] = useState<UserFormData>({
    username: "",
    displayName: "",
    password: "",
    role: "TEACHER",
    teacherId: "",
  });

  const needsTeacher = form.role === "TEACHER" || form.role === "PRINCIPAL";

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      ...form,
      teacherId: needsTeacher && form.teacherId ? form.teacherId : null,
    });
  }

  return (
    <Modal title="Thêm tài khoản" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên đăng nhập" hint="a–z, 0–9, . _ - (3–32 ký tự), không đổi sau khi tạo">
            <input
              className={inputClass}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              autoComplete="off"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9._\-]+"
            />
          </Field>
          <Field label="Tên hiển thị">
            <input
              className={inputClass}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
              minLength={2}
              maxLength={120}
            />
          </Field>
        </div>
        <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự">
          <input
            className={inputClass}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            type="text"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
          />
        </Field>
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          Không nhập email tại đây: giáo viên tự nhập email và nhập mã xác nhận
          gửi tới địa chỉ đó ở lần đăng nhập đầu tiên.
        </p>
        <Field label="Vai trò">
          <Select
            className="w-full"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value, teacherId: "" })}
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {roleLabelVi(role)}
              </option>
            ))}
          </Select>
        </Field>
        {needsTeacher ? (
          <Field label="Gắn với giáo viên" hint="Giáo viên chưa có tài khoản (hiện thị mã · họ tên)">
            <Select
              className="w-full"
              value={form.teacherId ?? ""}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
            >
              <option value="">— Chưa gắn —</option>
              {teachers
                .filter((t) => t.linkedUserId === null)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.fullName}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95 disabled:opacity-50"
          >
            Tạo tài khoản
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UserEditModal({
  initial,
  teachers,
  saving,
  onClose,
  onSubmit,
}: {
  initial: UserRow;
  teachers: TeacherOption[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: {
    displayName: string;
    role: string;
    teacherId: string | null;
  }) => void;
}) {
  const [form, setForm] = useState({
    displayName: initial.displayName,
    role: initial.role,
    teacherId: initial.teacher?.id ?? "",
  });

  const needsTeacher = form.role === "TEACHER" || form.role === "PRINCIPAL";

  return (
    <Modal title={`Sửa tài khoản ${initial.username}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            displayName: form.displayName.trim(),
            role: form.role,
            teacherId: needsTeacher && form.teacherId ? form.teacherId : null,
          });
        }}
        className="space-y-4"
      >
        <Field label="Tên hiển thị">
          <input
            className={inputClass}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
            minLength={2}
            maxLength={120}
          />
        </Field>
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          Email liên hệ:{" "}
          {initial.email ? (
            <span className="font-medium text-zinc-700">{initial.email}</span>
          ) : (
            "chưa có"
          )}
          . Chỉ chính người dùng mới đổi được email (kèm mã xác nhận) tại trang
          Tài khoản của tôi.
        </p>
        <Field label="Vai trò">
          <Select
            className="w-full"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {roleLabelVi(role)}
              </option>
            ))}
          </Select>
        </Field>
        {needsTeacher ? (
          <Field label="Gắn với giáo viên">
            <Select
              className="w-full"
              value={form.teacherId}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
            >
              <option value="">— Chưa gắn —</option>
              {teachers
                .filter((t) => t.linkedUserId === null || t.id === initial.teacher?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.fullName}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95 disabled:opacity-50"
          >
            Lưu thay đổi
          </button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { ClassPicker, useStudentClass } from "@/components/student/class-picker";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

const TYPE_META: Record<string, { label: string; cls: string }> = {
  TIMETABLE_PUBLISHED: { label: "Thời khóa biểu", cls: "bg-emerald-100 text-emerald-800" },
  TEACHER_CHANGED: { label: "Đổi giáo viên", cls: "bg-amber-100 text-amber-900" },
  ROOM_CHANGED: { label: "Đổi phòng", cls: "bg-zinc-200 text-zinc-700" },
  LESSON_CANCELLED: { label: "Hủy tiết", cls: "bg-red-100 text-red-800" },
  MAKEUP_LESSON_CREATED: { label: "Dạy bù", cls: "bg-blue-100 text-blue-800" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StudentNotificationsClient({
  classes,
  initialClass,
  initialNotifications,
}: {
  classes: { code: string; grade: number }[];
  initialClass: string | null;
  initialNotifications: NotificationItem[];
}) {
  const { selected, onChange } = useStudentClass(initialClass, classes, "/hsv/thong-bao");

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Thông báo</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Thay đổi ảnh hưởng đến lớp {selected ?? ""}
          </p>
        </div>
        <ClassPicker classes={classes} selected={selected} onChange={onChange} />
      </header>

      {!initialClass ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          Chọn lớp của bạn để xem thông báo.
        </p>
      ) : initialNotifications.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          Chưa có thông báo nào cho lớp {initialClass}.
        </p>
      ) : (
        <ul className="space-y-2">
          {initialNotifications.map((n) => {
            const meta = TYPE_META[n.type] ?? { label: n.type, cls: "bg-zinc-200 text-zinc-700" };
            return (
              <li key={n.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-zinc-400">{formatTime(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-zinc-900">{n.title}</p>
                <p className="text-sm text-zinc-600">{n.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

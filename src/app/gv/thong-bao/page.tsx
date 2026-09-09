import type { Metadata } from "next";
import { cookies } from "next/headers";

import { apiErrorToMessage, apiFetch } from "@/components/leadership/api";
import { ErrorBanner } from "@/components/leadership/ErrorBanner";
import { MarkAllReadButton } from "@/components/notifications/MarkAllReadButton";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import { NotificationLiveRefresher } from "@/components/notifications/live-refresher";
import type { NotificationsResponse } from "@/components/notifications/types";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PushOptIn } from "@/components/pwa/push-opt-in";
import { AppShell } from "@/components/site/app-shell";
import { requireTeacher } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thông báo — Măng Cành",
};

export default async function TeacherNotificationsPage() {
  const user = await requireTeacher();

  const cookieStore = await cookies();
  const cookie = cookieStore.toString();

  let notifications: NotificationsResponse["notifications"] | null = null;
  let error: string | null = null;
  try {
    notifications = (
      await apiFetch<NotificationsResponse>("/api/notifications", { cookie })
    ).notifications;
  } catch (caught) {
    error = apiErrorToMessage(caught, "/gv/thong-bao");
  }

  const unreadCount =
    notifications?.filter((notification) => notification.readAt === null).length ??
    0;

  return (
    <AppShell page="Thông báo" user={user}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Thông báo
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {unreadCount > 0
                ? `Bạn có ${unreadCount} thông báo chưa đọc.`
                : "Thông báo về lịch dạy và thời khóa biểu của bạn."}
            </p>
            <div className="mt-1">
              <NotificationLiveRefresher />
            </div>
          </div>
          {unreadCount > 0 ? <MarkAllReadButton /> : null}
        </header>

        <div className="mb-6 space-y-2">
          <PushOptIn />
          <InstallPrompt />
        </div>

        {error ? (
          <ErrorBanner message={error} />
        ) : notifications && notifications.length > 0 ? (
          <ul className="space-y-3">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationCard notification={notification} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
            Chưa có thông báo nào.
          </p>
        )}
      </div>
    </AppShell>
  );
}

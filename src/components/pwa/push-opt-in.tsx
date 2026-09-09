"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * Web Push opt-in for logged-in users (teachers and staff): requests
 * notification permission, subscribes via the service worker using the
 * server's VAPID key, and registers the subscription. Rendered only when
 * the browser and server both support push.
 */

type Status =
  | "loading"
  | "unsupported"
  | "disabled"
  | "denied"
  | "off"
  | "on"
  | "error";

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const array = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    array[i] = raw.charCodeAt(i);
  }
  return array;
}

export function PushOptIn() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (
          typeof window === "undefined" ||
          !("serviceWorker" in navigator) ||
          !("PushManager" in window) ||
          !("Notification" in window)
        ) {
          if (!cancelled) setStatus("unsupported");
          return;
        }
        const keyResponse = await fetch("/api/push/key");
        if (!keyResponse.ok) {
          if (!cancelled) setStatus("disabled");
          return;
        }
        if (Notification.permission === "denied") {
          if (!cancelled) setStatus("denied");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const keyResponse = await fetch("/api/push/key");
      if (!keyResponse.ok) {
        setStatus("disabled");
        return;
      }
      const { publicKey } = (await keyResponse.json()) as { publicKey: string };
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const json = subscription.toJSON();
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error("Đăng ký không thành công.");
      }
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không bật được thông báo.");
      setStatus("error");
    }
  }

  async function disable() {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tắt được thông báo.");
    }
  }

  if (status === "loading") return null;

  if (status === "denied") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <Icon name="bell" size={16} className="text-zinc-400" />
          Thông báo đẩy đang bị chặn
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Hãy cho phép thông báo cho trang web này trong cài đặt trình duyệt
          để nhận cảnh báo dạy thay, dạy bù và công bố thời khóa biểu.
        </p>
      </div>
    );
  }

  if (status === "on") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Icon name="check" size={13} />
          </span>
          Đang nhận thông báo đẩy trên thiết bị này
        </p>
        <button
          type="button"
          onClick={() => void disable()}
          className="min-h-11 rounded-lg border border-emerald-300 bg-white px-3.5 text-xs font-medium text-emerald-800 transition-colors hover:border-emerald-500 active:scale-95"
        >
          Tắt thông báo
        </button>
      </div>
    );
  }

  if (status === "unsupported" || status === "disabled" || status === "error") {
    // Stay silent when push simply is not available — no dead UI.
    return error ? (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {error}
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="text-sm font-medium text-amber-900">
          Nhận thông báo đẩy
        </p>
        <p className="mt-0.5 text-xs text-amber-800/80">
          Dạy thay, dạy bù và thời khóa biểu mới đến thẳng thiết bị này — kể
          cả khi bạn không mở ứng dụng.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void enable()}
        className="min-h-11 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-95"
      >
        <Icon name="bell" size={15} />
        Bật thông báo
      </button>
    </div>
  );
}

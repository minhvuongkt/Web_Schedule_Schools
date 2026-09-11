"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * PWA install entry point. Uses beforeinstallprompt where available
 * (Chrome/Edge/Android); on iOS Safari — which never fires that event —
 * shows the "Add to Home Screen" walkthrough. When the browser offers no
 * prompt (already installed elsewhere, Firefox, desktop Safari…) it still
 * renders and explains the manual menu path, so the button is always
 * findable except when the app already runs standalone.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

const subscribeNoop = (): (() => void) => () => undefined;

type HelpKind = "ios" | "manual" | null;

export function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [help, setHelp] = useState<HelpKind>(null);
  const standalone = useSyncExternalStore(
    subscribeNoop,
    isStandalone,
    () => false,
  );
  const ios = useSyncExternalStore(subscribeNoop, isIos, () => false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Already installed and running as an app — nothing to offer.
  if (standalone) return null;

  async function install() {
    if (!installEvent) {
      setHelp(ios ? "ios" : "manual");
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  }

  const helpPanel =
    help === "ios" ? (
      <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-800">
          Cài đặt trên iPhone / iPad
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-600">
          <li>Mở trang này bằng trình duyệt Safari.</li>
          <li>
            Nhấn nút <strong>Chia sẻ</strong> (hình vuông có mũi tên hướng
            lên).
          </li>
          <li>
            Chọn <strong>“Thêm vào Màn hình chính”</strong>.
          </li>
        </ol>
      </div>
    ) : help === "manual" ? (
      <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-800">
          Cài đặt trên điện thoại / máy tính
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-600">
          <li>
            Mở menu của trình duyệt (nút <strong>⋮</strong> ở góc trên bên phải
            với Chrome/Edge).
          </li>
          <li>
            Chọn <strong>“Cài đặt ứng dụng”</strong> (máy tính) hoặc{" "}
            <strong>“Thêm vào Màn hình chính”</strong> (điện thoại).
          </li>
          <li>
            Nếu không thấy mục đó: ứng dụng có thể đã được cài trước đó — kiểm
            tra màn hình chính của điện thoại.
          </li>
        </ol>
      </div>
    ) : null;

  if (compact) {
    return (
      <div>
        <button
          type="button"
          onClick={() => void install()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-700/25 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm ring-1 ring-stone-900/5 transition hover:border-emerald-700/50 hover:bg-emerald-50 active:scale-95"
        >
          <Icon name="download" size={16} />
          Cài đặt ứng dụng
        </button>
        {helpPanel}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div>
          <p className="text-sm font-medium text-blue-900">
            Cài đặt ứng dụng trên thiết bị này
          </p>
          <p className="mt-0.5 text-xs text-blue-800/80">
            Xem thời khóa biểu nhanh hơn và dùng được cả khi mất mạng.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void install()}
          className="min-h-11 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-95"
        >
          <Icon name="download" size={15} />
          Cài đặt
        </button>
      </div>
      {helpPanel}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";

const SYNCED_AT_KEY = "/__syncedAt";

const formatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatSyncedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatter.format(date);
}

/**
 * Reads the last-sync timestamp the service worker persists in Cache Storage
 * (cache "tkb-meta", key "/__syncedAt"). Renders nothing server-side until
 * mounted, so the page stays static and <noscript>-safe.
 */
export function LastSynced() {
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const readSyncedAt = async () => {
      try {
        if (!("caches" in window)) return;
        const response = await caches.match(SYNCED_AT_KEY);
        if (!response) return;
        const at = (await response.text()).trim();
        if (!cancelled && at) setSyncedAt(at);
      } catch {
        // Cache Storage unavailable — keep the "no data" message.
      }
    };

    const onSynced = (event: Event) => {
      const at = (event as CustomEvent<string>).detail;
      if (typeof at === "string" && at) setSyncedAt(at);
    };

    void readSyncedAt();
    window.addEventListener("tkb:synced-at", onSynced);
    return () => {
      cancelled = true;
      window.removeEventListener("tkb:synced-at", onSynced);
    };
  }, []);

  return (
    <p>
      {syncedAt
        ? `Đồng bộ lần cuối: ${formatSyncedAt(syncedAt)}`
        : "Chưa có dữ liệu offline."}
    </p>
  );
}

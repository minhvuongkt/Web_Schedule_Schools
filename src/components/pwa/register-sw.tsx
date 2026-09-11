"use client";

import { useEffect } from "react";

/**
 * Service-worker registration only. The manifest <link> is NOT injected
 * globally anymore: per-area manifests are declared by each area's layout
 * (metadata.manifest) so every installable surface belongs to exactly one
 * role. Pages without their own manifest (landing, login, guide) are not
 * installable — that removes the old shared "generic app" install path.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const { protocol, hostname } = window.location;
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";
    if (protocol !== "https:" && !isLocalhost) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; at?: string } | null;
      if (data?.type === "SYNCED_AT" && typeof data.at === "string") {
        window.dispatchEvent(
          new CustomEvent<string>("tkb:synced-at", { detail: data.at }),
        );
      }
    };
    const onControllerChange = () => {
      console.info("[pwa] service worker took control");
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(
        () => console.info("[pwa] service worker registered"),
        () => {
          // Registration failed — the app keeps working online-only.
        },
      );

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  return null;
}

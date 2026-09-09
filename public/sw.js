// Service worker for the public timetable PWA (Phase 1: read-only offline shell).
// Plain JS on purpose — served straight from /public with no build step.

const SHELL_CACHE = "tkb-shell-v4"; // bump on deploy: purges stale cached HTML + chunks
const META_CACHE = "tkb-meta";
const SYNCED_AT_KEY = "/__syncedAt";
const ALLOWED_CACHES = [SHELL_CACHE, META_CACHE];

const SHELL_ASSETS = [
  "/",
  "/tkb",
  "/offline",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

// Admin, teacher, leadership, auth and API routes are never cached nor served
// offline (Phase 1: authoritative editing stays online-only). "/bgH" is the
// leadership prefix used in docs/architecture.md; "/bg" is its short alias.
const ONLINE_ONLY = ["/admin", "/gv", "/bg", "/bgH", "/dang-nhap", "/api"];

function isOnlineOnly(pathname) {
  return ONLINE_ONLY.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.svg" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png"
  );
}

function isRscRequest(request, url) {
  return (
    url.searchParams.has("_rsc") ||
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-State-Tree")
  );
}

async function putInCache(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch {
    // Quota exceeded or storage unavailable — online serving still works.
  }
}

// Persist the last successful navigation sync so the offline page can render
// "Đồng bộ lần cuối: …", and notify live clients.
async function recordSyncedAt() {
  try {
    const at = new Date().toISOString();
    const cache = await caches.open(META_CACHE);
    await cache.put(
      SYNCED_AT_KEY,
      new Response(at, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    );
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({ type: "SYNCED_AT", at });
    }
  } catch {
    // Non-fatal: the offline page falls back to the previous timestamp.
  }
}

async function handleNavigation(request, cacheable) {
  try {
    const response = await fetch(request);
    if (cacheable && response.ok) {
      await putInCache(SHELL_CACHE, request, response.clone());
      await recordSyncedAt();
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return (await caches.match("/offline")) || Response.error();
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await putInCache(SHELL_CACHE, request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // allSettled: a single failed precache must not block installation.
      await Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !ALLOWED_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // mutations stay online-only

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Public pages: network-first + cache a copy; admin/auth pages are
    // network-only and fall through to /offline when the network fails.
    event.respondWith(handleNavigation(request, !isOnlineOnly(url.pathname)));
    return;
  }
  if (isOnlineOnly(url.pathname) || isRscRequest(request, url)) return;
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(request));
  }
});

// ---------------------------------------------------------------------------
// Web Push (RFC 8030). The server POSTs an aes128gcm-encrypted payload;
// the browser decrypts it and hands us the JSON via the push event.
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Thời khóa biểu Măng Cành";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Bạn có thông báo mới.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "tkb-notification",
      data: { url: data.url || "/gv/thong-bao" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/gv/thong-bao";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        const clientUrl = new URL(client.url, self.location.origin);
        if (clientUrl.pathname === url && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});

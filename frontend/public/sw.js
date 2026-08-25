/* Minimal service worker for Miracurl PWA.
 * - Chrome/Android require an active SW before firing beforeinstallprompt
 * - Network-first for /api/* (booking availability must be fresh)
 * - Cache-first for static assets (fonts, icons, JS bundles)
 * - Never caches HTML — always fresh from network to avoid stale-app trap
 */
const CACHE = "miracurl-v22";
const STATIC = [
  "/manifest.json", "/manifest-admin.json", "/favicon.svg",
  "/icon-192.png", "/icon-512.png",
  "/icon-admin-192.png", "/icon-admin-512.png",
];

self.addEventListener("install", (event) => {
  // No skipWaiting here — the page shows a "refresh to update" toast and the
  // user's click sends SKIP_WAITING (see message handler below).
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge every stale cache from prior deploys
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      // Tell all open tabs to hard-reload so they pick up the new bundle
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "SW_UPDATED" });
      }
    })(),
  );
});

// Allow the page to instruct us to skip waiting immediately
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache API responses (booking availability must be live)
  if (url.pathname.startsWith("/api/")) return;

  // HTML → always network (bypassing the HTTP cache) so users get the latest deploy immediately
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(req, { cache: "no-store" }).catch(() => caches.match("/")));
    return;
  }

  // Static assets → cache-first with background refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

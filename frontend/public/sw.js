/* Minimal service worker for Miracurl PWA.
 * - Chrome/Android require an active SW before firing beforeinstallprompt
 * - Network-first for /api/* (booking availability must be fresh)
 * - Cache-first for static assets (fonts, icons, JS bundles)
 * - Never caches HTML — always fresh from network to avoid stale-app trap
 */
const CACHE = "miracurl-v1";
const STATIC = ["/manifest.json", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache API responses (booking availability must be live)
  if (url.pathname.startsWith("/api/")) return;

  // HTML → always network so users get the latest deploy immediately
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(req).catch(() => caches.match("/")));
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

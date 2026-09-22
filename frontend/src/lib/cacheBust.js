import api from "@/lib/api";

const KEY = "mira_cache_v";
const WIPED = "mira_cache_wiped";

// After a deploy the server's cache-version changes: wipe the PWA service-worker caches so the
// new bundle is served, and reload ONCE. Called on the login page (so the reload happens before
// sign-in, not on the freshly loaded dashboard) and again inside the app as a safety net.
export async function ensureFreshBuild() {
  let v = "";
  try { v = (await api.get("/public/cache-version")).data?.v || ""; } catch { return; }
  if (!v) return;
  const stored = localStorage.getItem(KEY);
  if (stored === null || stored === v) { localStorage.setItem(KEY, v); return; }
  if (sessionStorage.getItem(WIPED) === v) { localStorage.setItem(KEY, v); return; } // already wiped this session — never loop
  sessionStorage.setItem(WIPED, v);
  let hadStale = false;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      hadStale = hadStale || regs.length > 0;
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      const keys = await window.caches.keys();
      hadStale = hadStale || keys.length > 0;
      await Promise.all(keys.map(k => window.caches.delete(k)));
    }
  } catch { /* best effort */ }
  localStorage.setItem(KEY, v);
  // Nothing was cached → the bundle we're running came straight from the network: no reload needed.
  if (hadStale) window.location.reload();
}

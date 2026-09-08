import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import log from "@/lib/log";
import { toast } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));

// Canonical host: send www.* visitors to the apex domain (one cookie scope, one SEO origin).
if (window.location.hostname.startsWith("www.")) {
  const apex = window.location.hostname.slice(4);
  window.location.replace(`${window.location.protocol}//${apex}${window.location.pathname}${window.location.search}${window.location.hash}`);
}

// Production: silence diagnostic console output (errors still surface).
if (process.env.NODE_ENV === "production") {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  console.warn = () => {};
}
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

// Register PWA service worker so browsers can offer "Install app".
// Only on production/https — dev builds skip to avoid HMR conflicts.
if ("serviceWorker" in navigator && window.location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Friendly update prompt: instead of silently reloading, offer a one-tap refresh.
        const promptUpdate = (worker) => {
          toast("Miracurl just got better ✨", {
            id: "sw-update",
            description: "A new version is ready — refresh to update.",
            duration: Infinity,
            action: {
              label: "Refresh ↻",
              onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
            },
          });
        };
        // If a new SW is already waiting from a previous visit, offer the update.
        if (reg.waiting) promptUpdate(reg.waiting);
        // Actively check for new deploys: every 30 min AND whenever the
        // (installed PWA) app comes back to the foreground.
        const check = () => reg.update().catch(() => {});
        setInterval(check, 30 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        // Poll for updates so tabs left open pick up new deploys quickly.
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              promptUpdate(nw);
            }
          });
        });
      })
      .catch((err) => log.warn("[PWA] SW registration failed:", err));

    // When a NEW SW replaces an old one, reload once so the UI runs the
    // latest bundle. Skip the very first install (no prior controller) —
    // reloading there aborts in-flight requests like a user's first login.
    // Only a *replacement* of an existing controller is a real update. A fresh
    // install (no controller at page load — first visit, or right after a cache
    // wipe) must never reload, otherwise the SW_UPDATED broadcast that follows
    // clients.claim() would trigger a second/third refresh.
    const initialController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const reloadOnce = () => {
      if (!initialController || reloaded) return;
      const last = Number(sessionStorage.getItem("mira_sw_reload_at") || 0);
      if (Date.now() - last < 60_000) return; // loop breaker: max one SW reload per minute per tab
      reloaded = true;
      sessionStorage.setItem("mira_sw_reload_at", String(Date.now()));
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);
    // Belt-and-braces for browsers that don't fire controllerchange.
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "SW_UPDATED") reloadOnce();
    });
  });
}

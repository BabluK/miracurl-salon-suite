import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
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
        // If a new SW is already waiting, tell it to activate immediately.
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        // Poll for updates so tabs left open pick up new deploys quickly.
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => console.warn("[PWA] SW registration failed:", err));

    // When the new SW activates and takes control, reload once so the UI
    // is guaranteed to be running the latest JS bundle.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    // The SW also broadcasts SW_UPDATED after clients.claim(); use that as a
    // belt-and-braces reload trigger on browsers that don't fire controllerchange.
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "SW_UPDATED" && !reloaded) {
        reloaded = true;
        window.location.reload();
      }
    });
  });
}

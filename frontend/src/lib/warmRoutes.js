// Pre-warm the pages an owner opens right after the dashboard, while the device is idle.
// The service worker caches these chunks, so later navigation never waits on the origin.
let warmed = false;

export function warmRoutes() {
  if (warmed) return;
  warmed = true;
  if (navigator.connection?.saveData) return;
  const run = () => {
    import("@/pages/POS").catch(() => {});
    import("@/pages/Appointments").catch(() => {});
    import("@/pages/Customers").catch(() => {});
    import("@/pages/Staff").catch(() => {});
    import("@/pages/Services").catch(() => {});
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 6000 });
  else setTimeout(run, 2500);
}

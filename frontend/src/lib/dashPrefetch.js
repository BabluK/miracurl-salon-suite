import api from "./api";
import { getSelectedBranch } from "./branch";

// Kick off /reports/dashboard as soon as the session is known so it overlaps the lazy page-chunk load.
let pending = null;

export function fetchDashboard(b) {
  return { t0: performance.now(), p: api.get("/reports/dashboard", { params: b ? { branch: b } : {} }) };
}

export function prefetchDashboard(force = false) {
  // force: right after sign-in the URL is still /login but the next screen is the dashboard.
  if (!force && !/^\/(dashboard)?$/.test(window.location.pathname)) return;
  const b = getSelectedBranch();
  pending = { b, ...fetchDashboard(b) };
  pending.p.catch(() => {});
}

// The dashboard payload already arrived inside /api/bootstrap — hand it to the page as if it were prefetched.
export function seedDashboardPrefetch(b, data, headers, t0) {
  pending = { b, t0, p: Promise.resolve({ data, headers: headers || {} }) };
}

export function takeDashboardPrefetch(b) {
  const hit = pending && pending.b === b ? pending : null;
  pending = null;
  return hit;
}

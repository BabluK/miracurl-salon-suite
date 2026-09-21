// Selected-branch state shared between the header switcher and dashboard/reports.
import { invalidateGetCache } from "@/lib/api";

const KEY = "miracurl_branch";

export function getSelectedBranch() {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function setSelectedBranch(name) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
  invalidateGetCache();
  window.dispatchEvent(new CustomEvent("branch-changed", { detail: name || "" }));
}

export function mainSalonLabel(tenant) {
  const name = tenant?.name || "Main salon";
  return tenant?.location ? `${name} — ${tenant.location}` : name;
}

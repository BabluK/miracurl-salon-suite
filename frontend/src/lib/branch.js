// Selected-branch state shared between the header switcher and dashboard/reports.
const KEY = "miracurl_branch";

export function getSelectedBranch() {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function setSelectedBranch(name) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent("branch-changed", { detail: name || "" }));
}

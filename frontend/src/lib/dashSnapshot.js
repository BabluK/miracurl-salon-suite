// Instant dashboard: the last KPI payload stays on the device (per user + salon + branch) so the next
// app open paints real numbers at 0 ms, then refreshes from the server. Wiped on logout.
const PREFIX = "mc_dash:";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export const dashSnapshotKey = (userId, tenantId, b) => `${PREFIX}${userId || ""}:${tenantId || ""}:${b || ""}`;

export function readDashSnapshot(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (!raw?.data || !raw.at || Date.now() - raw.at > MAX_AGE_MS) return null;
    return raw.data;
  } catch { return null; }
}

export function writeDashSnapshot(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* quota */ }
}

export function clearDashboardSnapshots() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
  } catch { /* private mode */ }
}

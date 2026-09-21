import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

let tenantSlug = null;

export function setTenantSlug(slug) {
  const next = slug || null;
  if (next !== tenantSlug) _recent.clear();
  tenantSlug = next;
}
export function getTenantSlug() { return tenantSlug; }

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Perf: identical GETs fired within a short window (StrictMode, sibling widgets,
// polling overlap, hopping Dashboard ↔ CRM ↔ POS and back) share one network
// round-trip. Any mutation wipes the cache so a POST → GET sequence always sees
// fresh data; a branch/salon switch wipes it too (see AppLayout / branch.js).
const GET_TTL_MS = 15000;
const _inflight = new Map();
const _recent = new Map();
const _getKey = (c) => `${tenantSlug || ""}|${c.baseURL || ""}${c.url}|${JSON.stringify(c.params || {})}`;
const _baseAdapter = axios.getAdapter(axios.defaults.adapter);
const _share = (res, config) => ({ ...res, config, data: typeof structuredClone === "function" ? structuredClone(res.data) : res.data });
api.defaults.adapter = (config) => {
  const method = (config.method || "get").toLowerCase();
  if (method !== "get" || ["blob", "arraybuffer", "stream"].includes(config.responseType) || config.noCache) {
    if (method !== "get") { _recent.clear(); }
    return _baseAdapter(config);
  }
  const key = _getKey(config);
  const hit = _recent.get(key);
  if (hit && Date.now() - hit.at < GET_TTL_MS) return Promise.resolve(_share(hit.res, config));
  if (_inflight.has(key)) return _inflight.get(key).then((res) => _share(res, config));
  const p = _baseAdapter(config).then((res) => {
    _recent.set(key, { at: Date.now(), res });
    return res;
  }).finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
};
export function invalidateGetCache() { _recent.clear(); }

// Auth is carried ONLY by the HttpOnly `access_token` cookie the server sets on
// login (sent automatically thanks to withCredentials). The JWT never touches
// JavaScript, so an XSS payload cannot read or exfiltrate it.
// CSRF double-submit: read the (non-HttpOnly) csrf_token cookie and echo it in
// the X-CSRF-Token header on every state-changing call. The server verifies the
// pair — a cross-site attacker can neither read the cookie nor set the header.
export function readCsrfToken() {
  const item = document.cookie.split("; ").find((v) => v.startsWith("csrf_token="));
  return item ? decodeURIComponent(item.slice("csrf_token=".length)) : null;
}

// Perf: request resized image variants — originals can be ~2MB each.
export function thumbUrl(url, w = 480) {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith("/api/files/")) return `${url.split("?")[0]}?w=${w}`;
  try {
    const u = new URL(url);
    if (u.hostname === "images.unsplash.com") {
      u.searchParams.set("w", String(w)); u.searchParams.set("q", "75");
      return u.toString();
    }
    if (u.hostname.endsWith("emergentagent.com") || u.hostname.endsWith("emergentagent.net")) {
      if (u.hostname.startsWith("static.prod-images") || u.hostname.startsWith("customer-assets")) {
        return `${BACKEND_URL}/api/img?src=${encodeURIComponent(url)}&w=${w}`;
      }
    }
  } catch { /* relative or odd url — leave as-is */ }
  return url;
}

api.interceptors.request.use((config) => {
  if (tenantSlug) config.headers["X-Tenant-Slug"] = tenantSlug;
  const method = (config.method || "get").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = readCsrfToken();
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});

// Guest-facing routes: a 401 here must never bounce the visitor to /login.
const PUBLIC_PREFIXES = ["/book", "/rewards/", "/color/", "/order/", "/gift", "/membership/", "/member/", "/pay/", "/feedback/",
  "/salon/", "/products", "/employee", "/demo", "/partner", "/success-stories", "/blog", "/mira.ai", "/mira-ai", "/reset-password",
  "/staff-registry", "/terms", "/privacy", "/refund-policy", "/review/", "/loyalty/", "/rate/", "/login", "/signup-salon",
  "/signup-restaurant", "/restaurant", "/features", "/pricing", "/about-us", "/contact-us", "/who-can-use", "/ceo", "/jobs", "/candidate/"];
export const isPublicPath = (p) => p === "/" || PUBLIC_PREFIXES.some((x) => p.startsWith(x));

// Global 401 handler — expired/invalid session → clear token + redirect to /login.
// Prevents the "blank Settings page" symptom users hit after long idle sessions.
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err?.response?.status;
    const url = err?.config?.url || "";
    // Sessions created before CSRF rollout have no csrf_token cookie yet — one
    // exempt /auth/refresh mints it, then the original request is retried once.
    const isCsrf = status === 403 && /csrf/i.test(String(err?.response?.data?.detail || ""));
    if (isCsrf && err.config && !err.config._csrfRetry) {
      err.config._csrfRetry = true;
      try {
        await api.post("/auth/refresh");
        return api(err.config);
      } catch { /* fall through to normal rejection */ }
    }
    // Never redirect on the bootstrap /auth/me probe or on the login endpoint itself —
    // AuthContext already handles those explicitly.
    const isAuthBootstrap = url.includes("/auth/me") || url.includes("/auth/login");
    const isRefresh = url.includes("/auth/refresh");
    // Access token expired (8h) but the refresh token (15d) may still be valid —
    // silently renew once and replay the original request.
    if (status === 401 && !isRefresh && !url.includes("/auth/login") && err.config && !err.config._authRetry) {
      err.config._authRetry = true;
      try {
        await api.post("/auth/refresh");
        return api(err.config);
      } catch { /* refresh token gone/revoked — fall through to redirect */ }
    }
    if (status === 401 && !isAuthBootstrap && !isRefresh && typeof window !== "undefined") {
      const path = window.location.pathname;
      // Don't loop if we're already on /login or any public (guest-facing) route
      if (!isPublicPath(path)) {
        window.location.assign(`${path.startsWith("/partner/") ? "/partner" : ""}/login?next=${encodeURIComponent(path + window.location.search)}`);
      }
    }
    return Promise.reject(err);
  },
);

// "Act as salon" mode — super-admin browsing/correcting a tenant's data.
export function setActAsSalon(slug, name) {
  try {
    localStorage.setItem("act_as_salon", JSON.stringify({ slug, name }));
    localStorage.setItem("miracurl_tenant", slug);
  } catch { /* private mode */ }
  setTenantSlug(slug);
}
export function getActAsSalon() {
  try { return JSON.parse(localStorage.getItem("act_as_salon") || "null"); } catch { return null; }
}
export function clearActAsSalon() {
  try {
    localStorage.removeItem("act_as_salon");
    localStorage.removeItem("miracurl_tenant");
  } catch { /* private mode */ }
  setTenantSlug(null);
}

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.message === "string") return detail.message;
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

/**
 * Determine the tenant slug for this browser session.
 * Priority: subdomain > localStorage > URL param (?tenant=) > null
 */
export function detectTenantSlug() {
  const host = window.location.hostname.toLowerCase();
  // production wildcard subdomains: {slug}.miracurl-suite.com
  // (also keep legacy .miracurl.com for backwards-compat with earlier branding)
  const wildcardDomains = [".miracurl-suite.com", ".miracurlunisexsaloon.com", ".miracurl.com"];
  for (const d of wildcardDomains) {
    if (host.endsWith(d) && host !== `www${d}`) {
      const sub = host.split(".")[0];
      if (sub && !["www", "api", "app"].includes(sub)) return sub;
    }
  }
  const stored = localStorage.getItem("miracurl_tenant");
  if (stored) return stored;
  const qs = new URLSearchParams(window.location.search);
  const q = qs.get("tenant");
  if (q) {
    localStorage.setItem("miracurl_tenant", q);
    return q;
  }
  return null;
}

export default api;

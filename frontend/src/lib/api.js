import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

let tenantSlug = null;

export function setTenantSlug(slug) { tenantSlug = slug || null; }
export function getTenantSlug() { return tenantSlug; }

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

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

api.interceptors.request.use((config) => {
  if (tenantSlug) config.headers["X-Tenant-Slug"] = tenantSlug;
  const method = (config.method || "get").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = readCsrfToken();
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});

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
    if (status === 401 && !isAuthBootstrap && typeof window !== "undefined") {
      const path = window.location.pathname;
      // Don't loop if we're already on /login or the public marketing/booking routes
      const isPublic = path === "/login" || path === "/" || path.startsWith("/book/") ||
                       path.startsWith("/review/") || path === "/signup-salon";
      if (!isPublic) {
        window.location.assign(`${path.startsWith("/partner") ? "/partner" : ""}/login?next=${encodeURIComponent(path + window.location.search)}`);
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

import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

let accessToken = null;
let tenantSlug = null;

export function setAccessToken(token) { accessToken = token || null; }
export function getAccessToken() { return accessToken; }
export function setTenantSlug(slug) { tenantSlug = slug || null; }
export function getTenantSlug() { return tenantSlug; }

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (tenantSlug) config.headers["X-Tenant-Slug"] = tenantSlug;
  return config;
});

// Global 401 handler — expired/invalid session → clear token + redirect to /login.
// Prevents the "blank Settings page" symptom users hit after long idle sessions.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const url = err?.config?.url || "";
    // Never redirect on the bootstrap /auth/me probe or on the login endpoint itself —
    // AuthContext already handles those explicitly.
    const isAuthBootstrap = url.includes("/auth/me") || url.includes("/auth/login");
    if (status === 401 && !isAuthBootstrap && typeof window !== "undefined") {
      accessToken = null;
      try { localStorage.removeItem("miracurl_token"); } catch { /* ignore quota */ }
      const path = window.location.pathname;
      // Don't loop if we're already on /login or the public marketing/booking routes
      const isPublic = path === "/login" || path === "/" || path.startsWith("/book/") ||
                       path.startsWith("/review/") || path === "/signup-salon";
      if (!isPublic) {
        window.location.assign(`/login?next=${encodeURIComponent(path + window.location.search)}`);
      }
    }
    return Promise.reject(err);
  },
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

/**
 * Determine the tenant slug for this browser session.
 * Priority: subdomain > localStorage > URL param (?tenant=) > null
 */
export function detectTenantSlug() {
  const host = window.location.hostname.toLowerCase();
  // production wildcard subdomains: {slug}.miracurlunisexsaloon.com
  // (also keep legacy .miracurl.com for backwards-compat with earlier branding)
  const wildcardDomains = [".miracurlunisexsaloon.com", ".miracurl.com"];
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

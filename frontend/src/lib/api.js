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
  // production wildcard: {slug}.miracurl.com
  if (host.endsWith(".miracurl.com") && host !== "www.miracurl.com") {
    const sub = host.split(".")[0];
    if (sub && !["www", "api", "app"].includes(sub)) return sub;
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

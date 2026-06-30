import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Auth uses httpOnly cookies set by the backend. We also keep an
// in-memory access token so cross-origin Bearer auth works in environments
// where third-party cookies may be blocked. This is intentionally NOT
// persisted to localStorage to avoid XSS token theft.
let accessToken = null;

export function setAccessToken(token) { accessToken = token || null; }
export function getAccessToken() { return accessToken; }

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
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

export default api;

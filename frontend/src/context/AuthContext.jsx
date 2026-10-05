import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import log from "@/lib/log";
import api, { formatApiError, setTenantSlug, detectTenantSlug, isPublicPath, bumpSessionEpoch } from "@/lib/api";
import { seedDashboardPrefetch } from "@/lib/dashPrefetch";
import { getSelectedBranch, setSelectedBranch } from "@/lib/branch";
import { clearDashboardSnapshots } from "@/lib/dashSnapshot";

const AuthContext = createContext(null);

// Service-layer: keeps AuthProvider thin.
async function fetchCurrentTenant() {
  try {
    const { data } = await api.get("/tenants/current");
    return data;
  } catch (e) {
    log.warn("[auth] tenant fetch failed:", e?.message || e);
    return null;
  }
}

function persistTenant(t) {
  if (t?.slug) {
    setTenantSlug(t.slug);
    localStorage.setItem("miracurl_tenant", t.slug);
  }
}

// The Boss's own browser must never count as a prospect in HQ traffic stats (see analytics.logVisit).
function markHqDevice() {
  try { localStorage.setItem("miracurl_hq_device", "1"); } catch { /* private mode */ }
}

function clearTenantStorage() {
  setTenantSlug(null);
  localStorage.removeItem("miracurl_tenant");
}

function clearSectionUnlocks() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("mgr_unlock:"))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch { /* private mode */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap tenant slug from subdomain / localStorage / URL
  useEffect(() => { setTenantSlug(detectTenantSlug()); }, []);

  useEffect(() => {
    let cancelled = false;
    // Returning from Google sign-in: AuthCallback exchanges the session_id first, so skip /auth/me here.
    if (window.location.hash?.includes("session_id=")) { setUser(false); setLoading(false); return undefined; }
    const PUBLIC_PREFIXES = ["/book", "/staff-registry", "/review/"];
    if (PUBLIC_PREFIXES.some(p => window.location.pathname.startsWith(p))) {
      setUser(false);
      setLoading(false);
      return undefined;
    }
    const guestPage = isPublicPath(window.location.pathname);
    (async () => {
      try {
        // Perf: ONE cold-start round-trip — session + tenant (+ dashboard KPIs when landing on the dashboard).
        // Owners far from the server used to pay 2-3 sequential round-trips here.
        const t0 = performance.now();
        const wantDash = !guestPage && /^\/(dashboard)?$/.test(window.location.pathname);
        const b0 = getSelectedBranch();
        const { data: boot, headers } = await api.get("/bootstrap", { params: wantDash ? { dash: 1, ...(b0 ? { branch: b0 } : {}) } : {} });
        if (cancelled) return;
        const data = boot.user;
        if (data.role === "manager" && data.branch) setSelectedBranch(data.branch);
        if (data.role === "super_admin") { markHqDevice(); setUser(data); return; }
        if (boot.dashboard) seedDashboardPrefetch(getSelectedBranch(), boot.dashboard, headers, t0);
        // Tenant + user land in one batch → the shell paints once with full context.
        if (boot.tenant) { setTenant(boot.tenant); persistTenant(boot.tenant); }
        setUser(data);
      } catch (e) {
        if (!cancelled) {
          if (e?.response?.status && e.response.status !== 401) {
            log.warn("[auth] /bootstrap failed:", e?.message || e);
          }
          setUser(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const afterAuth = useCallback(async (data) => {
    bumpSessionEpoch();
    clearSectionUnlocks();
    try { sessionStorage.removeItem("ms_logo_played"); } catch { /* private mode */ }
    if ((data.user.role === "manager" || data.user.role === "staff") && data.user.branch) setSelectedBranch(data.user.branch);
    if (data.user.role === "super_admin") {
      markHqDevice();
      setTenant(null);
      clearTenantStorage();
      setUser(data.user);
      return;
    }
    setTenantSlug(null); // drop any stale slug from a previous user on this device
    // Resolve the tenant BEFORE exposing the user: the workspace then mounts once with full context
    // (no tenant-less first render → second repaint that looked like a "double refresh").
    // Tenant + dashboard KPIs arrive in ONE round-trip, so the first paint already has its numbers.
    const t0 = performance.now();
    const b0 = getSelectedBranch();
    try {
      const { data: boot, headers } = await api.get("/bootstrap", { params: { dash: 1, ...(b0 ? { branch: b0 } : {}) } });
      if (boot.dashboard) seedDashboardPrefetch(getSelectedBranch(), boot.dashboard, headers, t0);
      if (boot.tenant) { setTenant(boot.tenant); persistTenant(boot.tenant); }
    } catch (e) {
      log.warn("[auth] bootstrap after login failed:", e?.message || e);
      const t = await fetchCurrentTenant();
      if (t) { setTenant(t); persistTenant(t); }
    }
    setUser(data.user);
  }, []);

  const login = useCallback(async (email, password, remember = false) => {
    try {
      const { data } = await api.post("/auth/login", { email, password, remember });
      await afterAuth(data);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message, detail: e.response?.data?.detail };
    }
  }, [afterAuth]);

  const googleLogin = useCallback(async (sessionId) => {
    try {
      const { data } = await api.post("/auth/google/session", { session_id: sessionId });
      await afterAuth(data);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, [afterAuth]);

  const register = useCallback(async (name, email, password) => {
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      await afterAuth(data);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, [afterAuth]);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); }
    catch (e) { log.warn("[auth] logout failed:", e?.message || e); }
    bumpSessionEpoch();
    clearSectionUnlocks();
    clearTenantStorage();
    clearDashboardSnapshots();
    try { sessionStorage.clear(); } catch { /* private mode */ }
    setUser(false);
    setTenant(null);
    // Back button must never resurrect a signed-out session: collapse history onto /login.
    try { window.history.replaceState(null, "", "/login"); } catch { /* ignore */ }
  }, []);

  const forgot = useCallback(async (email, personalEmail) => {
    try { await api.post("/auth/forgot-password", { email, personal_email: personalEmail || null }); return { ok: true }; }
    catch (e) { return { ok: false, error: formatApiError(e.response?.data?.detail) }; }
  }, []);

  const switchTenant = useCallback((slug) => {
    setTenantSlug(slug);
    if (slug) localStorage.setItem("miracurl_tenant", slug);
    else localStorage.removeItem("miracurl_tenant");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      if (data.role !== "super_admin") {  // branch switch: re-brand the shell (sidebar name/location, nav, logo) without a reload
        const t = await fetchCurrentTenant();
        if (t) { setTenant(t); persistTenant(t); }
      }
      setUser(data);
      return data;
    } catch (e) {
      log.warn("[auth] refresh failed:", e?.message || e);
      if (e?.response?.status === 401) { setUser(false); setTenant(null); }
      return null;
    }
  }, []);

  // Pages restored from the browser's back/forward cache (or reached via Back) re-check the session,
  // so a signed-out device never shows a cached dashboard/settings page.
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) refresh(); };
    const onPop = () => { refresh(); };
    window.addEventListener("pageshow", onShow);
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("pageshow", onShow); window.removeEventListener("popstate", onPop); };
  }, [refresh]);

  const value = useMemo(
    () => ({ user, tenant, loading, login, googleLogin, register, logout, forgot, switchTenant, refresh }),
    [user, tenant, loading, login, googleLogin, register, logout, forgot, switchTenant, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

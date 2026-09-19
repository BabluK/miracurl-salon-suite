import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import log from "@/lib/log";
import api, { formatApiError, setTenantSlug, detectTenantSlug, isPublicPath } from "@/lib/api";
import { setSelectedBranch } from "@/lib/branch";

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
        // Perf: fetch the session and the tenant in one parallel wave (was two sequential round-trips).
        // On guest pages (QR menu, gift, loyalty…) the tenant call waits for a real session so it never 401s.
        const tenantP = guestPage ? null : fetchCurrentTenant().catch(() => null);
        const { data } = await api.get("/auth/me");
        if (cancelled) return;
        setUser(data);
        if (data.role === "manager" && data.branch) setSelectedBranch(data.branch);
        if (data.role === "super_admin") return;
        const t = await (tenantP || fetchCurrentTenant().catch(() => null));
        if (cancelled || !t) return;
        setTenant(t);
        persistTenant(t);
      } catch (e) {
        if (!cancelled) {
          if (e?.response?.status && e.response.status !== 401) {
            log.warn("[auth] /auth/me failed:", e?.message || e);
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
    clearSectionUnlocks();
    setUser(data.user);
    if (data.user.role === "manager" && data.user.branch) setSelectedBranch(data.user.branch);
    if (data.user.role === "super_admin") {
      setTenant(null);
      clearTenantStorage();
      return;
    }
    setTenantSlug(null); // drop any stale slug from a previous user on this device
    const t = await fetchCurrentTenant();
    if (!t) return;
    setTenant(t);
    persistTenant(t);
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
    clearSectionUnlocks();
    clearTenantStorage();
    setUser(false);
    setTenant(null);
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
      setUser(data);
      if (data.role !== "super_admin") {  // branch switch: re-brand the shell (sidebar name/location, nav, logo) without a reload
        const t = await fetchCurrentTenant();
        if (t) { setTenant(t); persistTenant(t); }
      }
      return data;
    } catch (e) {
      log.warn("[auth] refresh failed:", e?.message || e);
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ user, tenant, loading, login, googleLogin, register, logout, forgot, switchTenant, refresh }),
    [user, tenant, loading, login, googleLogin, register, logout, forgot, switchTenant, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

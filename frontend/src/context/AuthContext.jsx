import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import log from "@/lib/log";
import api, { formatApiError, setTenantSlug, detectTenantSlug } from "@/lib/api";
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap tenant slug from subdomain / localStorage / URL
  useEffect(() => { setTenantSlug(detectTenantSlug()); }, []);

  useEffect(() => {
    let cancelled = false;
    const PUBLIC_PREFIXES = ["/book", "/staff-registry", "/review/"];
    if (PUBLIC_PREFIXES.some(p => window.location.pathname.startsWith(p))) {
      setUser(false);
      setLoading(false);
      return undefined;
    }
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (cancelled) return;
        setUser(data);
        if (data.role === "manager" && data.branch) setSelectedBranch(data.branch);
        if (data.role === "super_admin") return;
        const t = await fetchCurrentTenant();
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
    setUser(data.user);
    if (data.user.role === "manager" && data.user.branch) setSelectedBranch(data.user.branch);
    if (data.user.role === "super_admin") {
      setTenant(null);
      clearTenantStorage();
      return;
    }
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
      return data;
    } catch (e) {
      log.warn("[auth] refresh failed:", e?.message || e);
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ user, tenant, loading, login, register, logout, forgot, switchTenant, refresh }),
    [user, tenant, loading, login, register, logout, forgot, switchTenant, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

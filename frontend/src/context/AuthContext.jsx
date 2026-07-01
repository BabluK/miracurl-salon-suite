import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { formatApiError, setAccessToken, setTenantSlug, detectTenantSlug } from "@/lib/api";

const AuthContext = createContext(null);

// Service-layer: keeps AuthProvider thin.
async function fetchCurrentTenant() {
  try {
    const { data } = await api.get("/tenants/current");
    return data;
  } catch (e) {
    console.warn("[auth] tenant fetch failed:", e?.message || e);
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
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (cancelled) return;
        setUser(data);
        if (data.role === "super_admin") return;
        const t = await fetchCurrentTenant();
        if (cancelled || !t) return;
        setTenant(t);
        persistTenant(t);
      } catch (e) {
        if (!cancelled) {
          if (e?.response?.status && e.response.status !== 401) {
            console.warn("[auth] /auth/me failed:", e?.message || e);
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
    if (data.access_token) setAccessToken(data.access_token);
    setUser(data.user);
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

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
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
    catch (e) { console.warn("[auth] logout failed:", e?.message || e); }
    setAccessToken(null);
    clearTenantStorage();
    setUser(false);
    setTenant(null);
  }, []);

  const forgot = useCallback(async (email) => {
    try { await api.post("/auth/forgot-password", { email }); return { ok: true }; }
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
      console.warn("[auth] refresh failed:", e?.message || e);
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

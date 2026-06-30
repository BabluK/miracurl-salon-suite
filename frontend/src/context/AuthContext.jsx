import { createContext, useContext, useEffect, useState } from "react";
import api, { formatApiError, setAccessToken, setTenantSlug, detectTenantSlug } from "@/lib/api";

const AuthContext = createContext(null);

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
        if (data.role !== "super_admin") {
          // Fetch tenant so UI can show name etc.
          try {
            const { data: t } = await api.get("/tenants/current");
            if (!cancelled) {
              setTenant(t);
              if (t?.slug) { setTenantSlug(t.slug); localStorage.setItem("miracurl_tenant", t.slug); }
            }
          } catch (e) { /* tenant fetch optional */ }
        }
      } catch {
        if (!cancelled) setUser(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const _afterAuth = async (data) => {
    if (data.access_token) setAccessToken(data.access_token);
    setUser(data.user);
    if (data.user.role !== "super_admin") {
      try {
        const { data: t } = await api.get("/tenants/current");
        setTenant(t);
        if (t?.slug) { setTenantSlug(t.slug); localStorage.setItem("miracurl_tenant", t.slug); }
      } catch (e) { /* tenant fetch optional */ }
    } else {
      setTenant(null);
      setTenantSlug(null);
      localStorage.removeItem("miracurl_tenant");
    }
  };

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      await _afterAuth(data);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (name, email, password) => {
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      await _afterAuth(data);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); }
    catch (e) { console.warn("Logout failed:", e?.message || e); }
    setAccessToken(null);
    setTenantSlug(null);
    localStorage.removeItem("miracurl_tenant");
    setUser(false);
    setTenant(null);
  };

  const forgot = async (email) => {
    try { await api.post("/auth/forgot-password", { email }); return { ok: true }; }
    catch (e) { return { ok: false, error: formatApiError(e.response?.data?.detail) }; }
  };

  const switchTenant = (slug) => {
    setTenantSlug(slug);
    if (slug) localStorage.setItem("miracurl_tenant", slug);
    else localStorage.removeItem("miracurl_tenant");
  };

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, register, logout, forgot, switchTenant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }

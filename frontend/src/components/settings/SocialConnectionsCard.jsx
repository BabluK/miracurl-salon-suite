import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Instagram, Star, Link2, Unlink, Loader2, KeyRound, Copy } from "lucide-react";

export const SocialConnectionsCard = () => {
  const [conn, setConn] = useState(null);
  const [busy, setBusy] = useState("");

  const load = () => api.get("/social/connections").then(r => setConn(r.data)).catch(() => {});

  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search).get("social");
    if (!p) return;
    const msgs = {
      meta_ok: ["success", "Instagram & Facebook connected ✦"],
      meta_pick_page: ["info", "Connected! Now pick your salon's Facebook Page below."],
      meta_no_pages: ["error", "No Facebook Pages found on this account — create a Page and link your Instagram to it first."],
      meta_error: ["error", "Meta connection failed — try again"],
      google_ok: ["success", "Google Business connected ✦"],
      google_pending: ["info", "Google connected — Business Profile API access is still pending Google's approval."],
      google_error: ["error", "Google connection failed — try again"],
    };
    const [kind, msg] = msgs[p] || [];
    if (msg) (kind === "success" ? toast.success : kind === "error" ? toast.error : toast.info)(msg);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const connect = async (provider) => {
    setBusy(provider);
    try {
      const { data } = await api.get(`/social/${provider}/oauth/start`);
      window.location.href = data.auth_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start connection");
      setBusy("");
    }
  };

  const disconnect = async (provider) => {
    if (!window.confirm("Disconnect this account? Mira will stop auto-posting to it.")) return;
    await api.delete(`/social/${provider}`);
    toast.success("Disconnected");
    load();
  };

  const pickPage = async (pageId) => {
    setBusy("pick");
    try {
      const { data } = await api.post("/social/meta/select-page", { page_id: pageId });
      toast.success(`Linked to ${data.page_name}${data.ig_username ? ` + @${data.ig_username}` : ""} ✦`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't select page");
    } finally { setBusy(""); }
  };

  if (!conn) return null;
  const metaConnected = !!conn.facebook;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="social-connections-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center">
          <Link2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Connected Accounts</h2>
          <p className="text-xs text-slate-500 mt-1">Link your social accounts so Mira Studio can auto-post promos and reply to Google reviews for you.</p>
        </div>
      </div>

      {/* Meta row */}
      <div className="border border-slate-100 rounded-xl p-4 flex flex-wrap items-center gap-3" data-testid="meta-connection-row">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white flex items-center justify-center"><Instagram className="w-4.5 h-4.5" /></div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-semibold text-slate-800">Instagram + Facebook</p>
          {metaConnected ? (
            <p className="text-xs text-emerald-600">✓ {conn.facebook.page_name}{conn.instagram ? ` · @${conn.instagram.username || conn.instagram.ig_user_id}` : " · (no Instagram linked to this Page)"}</p>
          ) : !conn.meta_configured ? (
            <p className="text-xs text-amber-600 flex items-center gap-1"><KeyRound className="w-3 h-3" /> Setup required — Meta App ID & Secret not added yet</p>
          ) : (
            <p className="text-xs text-slate-400">Not connected</p>
          )}
        </div>
        {metaConnected ? (
          <button data-testid="meta-disconnect-btn" onClick={() => disconnect("meta")} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 inline-flex items-center gap-1"><Unlink className="w-3 h-3" /> Disconnect</button>
        ) : (
          <button data-testid="meta-connect-btn" onClick={() => connect("meta")} disabled={!conn.meta_configured || busy === "meta"}
            className="text-xs px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === "meta" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Connect
          </button>
        )}
      </div>

      {!metaConnected && conn.meta_pages?.length > 0 && (
        <div className="mt-2 border border-fuchsia-200 bg-fuchsia-50/50 rounded-xl p-3" data-testid="meta-page-picker">
          <p className="text-xs font-semibold text-slate-700 mb-2">Pick your salon&apos;s Facebook Page:</p>
          <div className="space-y-1.5">
            {conn.meta_pages.map(p => (
              <button key={p.id} onClick={() => pickPage(p.id)} disabled={busy === "pick"}
                className="w-full text-left text-sm px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-fuchsia-300">
                {p.name} {p.ig_username && <span className="text-xs text-fuchsia-600">· @{p.ig_username}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Google row */}
      <div className="border border-slate-100 rounded-xl p-4 flex flex-wrap items-center gap-3 mt-3" data-testid="google-connection-row">
        <div className="w-9 h-9 rounded-lg bg-amber-400 text-white flex items-center justify-center"><Star className="w-4.5 h-4.5" /></div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-semibold text-slate-800">Google Business Profile</p>
          {conn.google_business ? (
            conn.google_business.api_ready
              ? <p className="text-xs text-emerald-600">✓ {conn.google_business.location_title || "Connected"} — review replies enabled</p>
              : <p className="text-xs text-amber-600">Connected — waiting for Google&apos;s Business Profile API approval</p>
          ) : !conn.google_configured ? (
            <p className="text-xs text-amber-600 flex items-center gap-1"><KeyRound className="w-3 h-3" /> Setup required — Google OAuth Client ID & Secret not added yet</p>
          ) : (
            <p className="text-xs text-slate-400">Not connected</p>
          )}
        </div>
        {conn.google_business ? (
          <button data-testid="google-disconnect-btn" onClick={() => disconnect("google")} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 inline-flex items-center gap-1"><Unlink className="w-3 h-3" /> Disconnect</button>
        ) : (
          <button data-testid="google-connect-btn" onClick={() => connect("google")} disabled={!conn.google_configured || busy === "google"}
            className="text-xs px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === "google" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Connect
          </button>
        )}
      </div>

      {!conn.google_business && conn.google_configured && (
        <div className="mt-2 border border-amber-200 bg-amber-50/70 rounded-xl p-3" data-testid="google-redirect-uri-help">
          <p className="text-xs font-semibold text-slate-700">Seeing “Error 400: redirect_uri_mismatch”?</p>
          <p className="text-xs text-slate-500 mt-1">
            In <b>Google Cloud Console → APIs &amp; Services → Credentials</b>, open your OAuth client and add this exact URL under <b>Authorized redirect URIs</b>:
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 break-all text-slate-700" data-testid="google-redirect-uri-value">{conn.google_redirect_uri}</code>
            <button data-testid="google-redirect-uri-copy-btn"
              onClick={() => { navigator.clipboard.writeText(conn.google_redirect_uri); toast.success("Redirect URI copied"); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 text-white inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">Tip: your live (deployed) site has a different domain — open this Settings page on the live site and add that URI too.</p>
        </div>
      )}
    </div>
  );
};

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Smartphone, Monitor, Tablet, LogOut, ShieldCheck, Loader2, MapPin, Fingerprint, KeyRound, AlertTriangle, RefreshCw } from "lucide-react";

const timeAgo = (iso) => {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 120) return "active now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = Math.floor(s / 86400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

const flag = (cc) => cc && cc.length === 2
  ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0)))
  : "";

const deviceIcon = (label) => {
  if (/ipad|tablet/i.test(label || "")) return Tablet;
  if (/iphone|android/i.test(label || "")) return Smartphone;
  return Monitor;
};

function SessionRow({ s, isNewPlace, busy, onLogout }) {
  const Icon = deviceIcon(s.device);
  const [br, dev] = (s.device || "Browser on Unknown device").split(" on ");
  return (
    <div data-testid={`device-row-${s.sid}`}
      className={`group flex items-center gap-3 sm:gap-4 rounded-xl border px-3 sm:px-4 py-3 transition-colors ${
        s.current ? "border-emerald-200 bg-emerald-50/60" : isNewPlace ? "border-amber-200 bg-amber-50/40" : "border-slate-100 bg-white hover:border-slate-200"}`}>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        s.current ? "bg-emerald-100 text-emerald-700" : isNewPlace ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-800 truncate">{dev}<span className="font-normal text-slate-400"> · {br}</span></p>
          {s.current && <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">This device</span>}
          {isNewPlace && !s.current && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded-full px-2 py-0.5" data-testid={`device-new-location-${s.sid}`}>
              <AlertTriangle className="w-2.5 h-2.5" /> New location
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1" data-testid={`device-location-${s.sid}`}>
            <MapPin className="w-3 h-3 text-slate-400" />
            {flag(s.country_code) && <span className="text-sm leading-none">{flag(s.country_code)}</span>}
            {s.location || "Locating…"}
          </span>
          <span className="inline-flex items-center gap-1">
            {s.method === "passkey" ? <Fingerprint className="w-3 h-3 text-slate-400" /> : <KeyRound className="w-3 h-3 text-slate-400" />}
            {s.method === "passkey" ? "Fingerprint / Face ID" : "Password"}
          </span>
          <span className={s.current || timeAgo(s.last_seen) === "active now" ? "text-emerald-600 font-medium" : ""}>{timeAgo(s.last_seen)}</span>
          <span className="text-slate-400">IP {s.ip || "—"} · since {(s.created_at || "").slice(0, 10)}</span>
        </div>
      </div>
      {!s.current && (
        <button onClick={onLogout} disabled={busy}
          data-testid={`device-logout-${s.sid}`}
          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-rose-200 text-rose-600 text-[11px] font-bold hover:bg-rose-600 hover:text-white hover:border-rose-600 disabled:opacity-50 transition-colors">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />} Sign out
        </button>
      )}
    </div>
  );
}

export const DevicesCard = () => {
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api.get("/auth/sessions").then(({ data }) => setSessions(data.sessions)).catch(() => setSessions([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (sessions?.some(s => !s.location)) { const t = setTimeout(load, 4000); return () => clearTimeout(t); }
  }, [sessions, load]);

  async function logoutOne(s) {
    if (!window.confirm(`Sign out ${s.device}${s.location ? ` in ${s.location}` : ""}? It loses access instantly.`)) return;
    setBusy(s.sid);
    try {
      await api.delete(`/auth/sessions/${s.sid}`);
      toast.success("Device signed out");
      load();
    } catch { toast.error("Could not sign out that device"); }
    finally { setBusy(""); }
  }
  async function logoutAll() {
    if (!window.confirm("Sign out every other device? Only this one stays logged in.")) return;
    setBusy("all");
    try {
      const { data } = await api.post("/auth/sessions/logout-all");
      toast.success(`Signed out ${data.signed_out} other device(s)`);
      load();
    } catch { toast.error("Could not sign out other devices"); }
    finally { setBusy(""); }
  }

  const list = sessions || [];
  const current = list.find(s => s.current);
  const others = list.filter(s => !s.current);
  const homeCountry = current?.country || "";
  const isNewPlace = (s) => !!homeCountry && !!s.country && s.country !== homeCountry;
  const suspicious = others.filter(isNewPlace).length;

  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-6" data-testid="devices-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Signed-in Devices
            {list.length > 0 && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5" data-testid="devices-count">{list.length}</span>}
          </h3>
          <p className="text-xs text-slate-500 mt-1">Every device with access to this account, with where it signed in from. Don't recognise one? Sign it out — access ends instantly.</p>
        </div>
        <button onClick={load} title="Refresh" data-testid="devices-refresh" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <RefreshCw className={`w-4 h-4 ${sessions === null ? "animate-spin" : ""}`} />
        </button>
      </div>

      {suspicious > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="devices-new-location-alert">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {suspicious} device{suspicious === 1 ? " is" : "s are"} signed in from a different country than this one. If that's not you, sign it out and change your password.
        </div>
      )}

      {sessions === null && <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>}

      <div className="mt-4 space-y-2">
        {current && <SessionRow s={current} isNewPlace={false} busy={false} onLogout={() => {}} />}
        {others.length > 0 && (
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold pt-2 pb-1">Other devices ({others.length})</p>
        )}
        {others.map((s) => (
          <SessionRow key={s.sid} s={s} isNewPlace={isNewPlace(s)} busy={busy === s.sid} onLogout={() => logoutOne(s)} />
        ))}
        {sessions?.length === 0 && <p className="text-xs text-slate-400 py-2">No tracked devices yet — devices appear here from their next login.</p>}
      </div>

      {others.length > 0 && (
        <button onClick={logoutAll} disabled={busy === "all"} data-testid="devices-logout-all"
          className="mt-4 w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-rose-600 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
          {busy === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          Sign out all other devices ({others.length})
        </button>
      )}
    </div>
  );
};

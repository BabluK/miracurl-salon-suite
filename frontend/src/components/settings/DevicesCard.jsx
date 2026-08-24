import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Smartphone, Monitor, LogOut, ShieldCheck, Loader2 } from "lucide-react";

const timeAgo = (iso) => {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 120) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} day(s) ago`;
};

export const DevicesCard = () => {
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api.get("/auth/sessions").then(({ data }) => setSessions(data.sessions)).catch(() => setSessions([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function logoutOne(sid) {
    setBusy(sid);
    try {
      await api.delete(`/auth/sessions/${sid}`);
      toast.success("Device signed out");
      load();
    } catch { toast.error("Could not sign out that device"); }
    finally { setBusy(""); }
  }
  async function logoutAll() {
    setBusy("all");
    try {
      const { data } = await api.post("/auth/sessions/logout-all");
      toast.success(`Signed out ${data.signed_out} other device(s)`);
      load();
    } catch { toast.error("Could not sign out other devices"); }
    finally { setBusy(""); }
  }

  const others = (sessions || []).filter((s) => !s.current).length;
  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-6" data-testid="devices-card">
      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600" /> Logged-in Devices
      </h3>
      <p className="text-xs text-slate-500 mt-1">Every device signed in to this account. Sign out any device you don't recognise — it loses access instantly.</p>

      {sessions === null && <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>}

      <div className="mt-4 space-y-2">
        {(sessions || []).map((s) => {
          const mobile = /iphone|ipad|android/i.test(s.device || "");
          const Icon = mobile ? Smartphone : Monitor;
          return (
            <div key={s.sid} data-testid={`device-row-${s.sid}`}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${s.current ? "border-emerald-200 bg-emerald-50/50" : "border-slate-100 bg-slate-50/50"}`}>
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-5 h-5 shrink-0 ${s.current ? "text-emerald-600" : "text-slate-400"}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {s.device}
                    {s.current && <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">This device</span>}
                  </p>
                  <p className="text-[10px] text-slate-400">IP {s.ip || "—"} · active {timeAgo(s.last_seen)} · since {(s.created_at || "").slice(0, 10)}</p>
                </div>
              </div>
              {!s.current && (
                <button onClick={() => logoutOne(s.sid)} disabled={busy === s.sid}
                  data-testid={`device-logout-${s.sid}`}
                  className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                  {busy === s.sid ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />} Sign out
                </button>
              )}
            </div>
          );
        })}
        {sessions?.length === 0 && <p className="text-xs text-slate-400 py-2">No tracked devices yet — devices appear here from their next login.</p>}
      </div>

      {others > 0 && (
        <button onClick={logoutAll} disabled={busy === "all"} data-testid="devices-logout-all"
          className="mt-4 w-full py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          Sign out all other devices ({others})
        </button>
      )}
    </div>
  );
};

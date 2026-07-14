import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { ShieldAlert, Lock, RefreshCw, Unlock } from "lucide-react";

const timeAgo = (iso) => {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function SecurityCard() {
  const [data, setData] = useState(null);
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/super-admin/security/login-attempts");
      setData(r.data);
      const s = await api.get("/super-admin/security/snapshot");
      setSnap(s.data);
    } catch {
      toast.error("Couldn't load security activity");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearLock(identifier) {
    try {
      await api.post("/super-admin/security/clear-lockout", { identifier });
      toast.success("Lockout cleared — they can log in now");
      load();
    } catch {
      toast.error("Couldn't clear lockout");
    }
  }

  const attempts = data?.attempts || [];

  return (
    <div className="bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden" data-testid="security-card">
      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-red-500/15 blur-3xl pointer-events-none" />
      <div className="relative flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-red-300 font-semibold flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Security · Login activity
          </div>
          <p className="text-xs text-white/60 mt-1">
            Lockout: <b className="text-white/80">{data?.policy?.max_attempts ?? 5} fails</b> → locked <b className="text-white/80">{data?.policy?.lock_minutes ?? 15} min</b>
            {data && <> · <span className={data.locked_now ? "text-red-300 font-semibold" : "text-emerald-300"}>{data.locked_now} locked now</span></>}
          </p>
        </div>
        <button onClick={load} disabled={loading} data-testid="security-refresh"
          className="p-2 rounded-lg bg-white/10 border border-white/20 text-white/70 hover:text-white hover:bg-white/20 shrink-0">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {snap && (
        <div className="relative mb-4" data-testid="security-snapshot">
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-300/80 font-semibold mb-2">7-day snapshot · all salons</div>
          {snap.days.length === 0 ? (
            <p className="text-xs text-white/50 bg-white/5 border border-white/10 rounded-xl px-3 py-3">No security events in the last 7 days — all quiet ✦</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-white/40 uppercase tracking-wider text-left">
                    <th className="py-1 pr-2 font-medium">Day</th>
                    <th className="py-1 pr-2 font-medium">Failed logins</th>
                    <th className="py-1 pr-2 font-medium">PIN fails</th>
                    <th className="py-1 pr-2 font-medium">PIN lockouts</th>
                    <th className="py-1 font-medium">Rate-limit hits</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.days.map(d => (
                    <tr key={d.day} className="border-t border-white/5 text-white/75">
                      <td className="py-1.5 pr-2">{new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                      <td className={`py-1.5 pr-2 ${d.failed_login > 10 ? "text-red-300 font-semibold" : ""}`}>{d.failed_login}</td>
                      <td className="py-1.5 pr-2">{d.pin_fail}</td>
                      <td className={`py-1.5 pr-2 ${d.pin_lockout > 0 ? "text-red-300 font-semibold" : ""}`}>{d.pin_lockout}</td>
                      <td className={`py-1.5 ${d.rate_limit > 20 ? "text-amber-300 font-semibold" : ""}`}>{d.rate_limit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {snap.by_salon.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-white/40 uppercase tracking-wider self-center">By salon:</span>
              {snap.by_salon.map(s => (
                <span key={s.salon} className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70">
                  {s.salon} · <b className="text-amber-300">{s.events}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative space-y-1.5 max-h-72 overflow-y-auto">
        {attempts.length === 0 && (
          <p className="text-sm text-white/50 py-6 text-center" data-testid="security-empty">No failed login attempts tracked — all clear ✦</p>
        )}
        {attempts.map((a) => (
          <div key={a.identifier} data-testid={`security-row-${a.email}`}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${a.locked ? "bg-red-500/10 border-red-400/40" : "bg-white/5 border-white/10"}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.locked ? "bg-red-500/20 text-red-300" : "bg-white/10 text-white/50"}`}>
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{a.email}</p>
              <p className="text-[11px] text-white/50">
                IP {a.ip} · {a.count} fail{a.count === 1 ? "" : "s"} · {timeAgo(a.last_attempt)}
              </p>
            </div>
            {a.locked ? (
              <button onClick={() => clearLock(a.identifier)} data-testid={`clear-lockout-${a.email}`}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white text-slate-900 font-semibold hover:bg-slate-100 shrink-0">
                <Unlock className="w-3 h-3" /> Unlock
              </button>
            ) : (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 uppercase tracking-wider shrink-0">watched</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

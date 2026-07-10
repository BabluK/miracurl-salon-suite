import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Stethoscope, X, Loader2, Zap, CheckCircle2, AlertTriangle, Database, Clock } from "lucide-react";

const LEVEL_STYLES = {
  ok: "bg-emerald-50 border-emerald-200 text-emerald-700",
  warn: "bg-amber-50 border-amber-200 text-amber-700",
  error: "bg-rose-50 border-rose-200 text-rose-700",
};

export function DiagnoseTenantModal({ tenant, onClose }) {
  const [data, setData] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get(`/super/tenants/${tenant.id}/diagnostics`);
      setData(d);
    } catch { toast.error("Diagnostics failed"); }
  }, [tenant.id]);
  useEffect(() => { load(); }, [load]);

  async function fix() {
    setFixing(true);
    try {
      const { data: r } = await api.post(`/super/tenants/${tenant.id}/clear-cache`);
      setFixResult(r);
      toast.success("Cache cleared & auto-fix applied ✦");
      load();
    } catch { toast.error("Auto-fix failed"); }
    finally { setFixing(false); }
  }

  const heavy = data ? Object.entries(data.counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl m-auto flex flex-col max-h-[88vh] overflow-hidden" onClick={e => e.stopPropagation()} data-testid="diagnose-tenant-modal">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-playfair text-xl flex items-center gap-2"><Stethoscope className="w-5 h-5 text-sky-600" /> Diagnose — {tenant.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="diagnose-close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {!data ? (
            <div className="flex items-center gap-2 text-slate-400 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Running health checks…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">DB Response</p>
                  <p className={`text-lg font-bold ${data.db_ping_ms < 50 ? "text-emerald-600" : data.db_ping_ms < 200 ? "text-amber-600" : "text-rose-600"}`} data-testid="diag-ping">{data.db_ping_ms} ms</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Uploads</p>
                  <p className="text-lg font-bold text-slate-700">{data.uploads_mb} MB</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1"><Clock className="w-3 h-3" /> Last Activity</p>
                  <p className="text-xs text-slate-600 mt-1">Appointment: {(data.last_activity.appointments || "—").slice(0, 16).replace("T", " ")}<br />Invoice: {(data.last_activity.invoices || "—").slice(0, 16).replace("T", " ")}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Findings</p>
                <div className="space-y-2" data-testid="diag-issues">
                  {data.issues.map((it, i) => (
                    <div key={i} className={`flex items-start gap-2 text-xs border rounded-lg px-3 py-2 ${LEVEL_STYLES[it.level]}`}>
                      {it.level === "ok" ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                      {it.text}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><Database className="w-3 h-3" /> Data volume (largest first)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {heavy.map(([c, n]) => (
                    <div key={c} className="flex justify-between text-[11px] bg-slate-50 border border-slate-100 rounded px-2 py-1">
                      <span className="text-slate-500 truncate">{c}</span><span className="font-semibold text-slate-700 ml-1">{n.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {fixResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800" data-testid="diag-fix-result">
                  <p className="font-semibold mb-1">✦ Auto-fix complete</p>
                  <p>Stale login states cleared: {fixResult.cleared.stale_oauth_states} · Stuck jobs cleared: {fixResult.cleared.stuck_flyer_jobs} · Old AI chats removed: {fixResult.cleared.old_public_ai_chats}</p>
                  <p className="mt-1">{fixResult.note}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">
            {data?.cache_reset_at ? `Last cache clear: ${data.cache_reset_at.slice(0, 16).replace("T", " ")} UTC` : "Cache never cleared for this salon"}
          </p>
          <button data-testid="diag-fix-btn" onClick={fix} disabled={fixing || !data}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50">
            <Zap className="w-4 h-4" /> {fixing ? "Fixing…" : "Clear cache & auto-fix"}
          </button>
        </div>
      </div>
    </div>
  );
}

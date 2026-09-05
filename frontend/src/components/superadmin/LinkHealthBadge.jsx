import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Link2, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";

export function LinkHealthBadge() {
  const [h, setH] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); api.get("/super/link-health").then(r => setH(r.data)).catch(() => setH({ ok: false, base: "", checks: [{ label: "Link health check failed to run", ok: false, detail: "API error" }] })).finally(() => setBusy(false)); };
  useEffect(() => { load(); }, []);
  if (!h) return null;
  const host = h.host || "APP_PUBLIC_URL missing";
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} data-testid="link-health-badge"
        title={h.ok ? "Every outgoing link (emails, QR codes, pay links) uses your official domain" : "Outgoing links may be wrong — click for details"}
        className={`text-[10px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${h.ok
          ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
          : "bg-rose-500/20 border-rose-400/50 text-rose-200 animate-pulse"}`}>
        {h.ok ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
        {h.ok ? `All links point to ${host}` : `Links broken · ${host}`}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 z-30 rounded-2xl border border-white/10 bg-[#15151b] shadow-2xl p-3 text-left" data-testid="link-health-details">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#d4af37]/80 font-semibold inline-flex items-center gap-1"><Link2 className="w-3 h-3" /> Link health</p>
            <button onClick={load} disabled={busy} className="text-slate-400 hover:text-white" title="Re-check" data-testid="link-health-refresh"><RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} /></button>
          </div>
          <ul className="space-y-1">
            {h.checks.map(c => (
              <li key={c.label} className="flex items-start gap-2 text-[11px]" data-testid={`link-health-check-${c.ok ? "ok" : "fail"}`}>
                <span className={`mt-0.5 w-3.5 h-3.5 rounded-full shrink-0 inline-flex items-center justify-center text-[9px] font-bold ${c.ok ? "bg-emerald-500/30 text-emerald-300" : "bg-rose-500/30 text-rose-300"}`}>{c.ok ? "✓" : "!"}</span>
                <span className="text-slate-200">{c.label}<span className="block text-[10px] text-slate-500 break-all">{c.detail}</span></span>
              </li>
            ))}
          </ul>
          {!h.ok && <p className="mt-2 text-[10px] text-rose-200/80">Fix: set <code>APP_PUBLIC_URL=https://miracurl-suite.com</code> in the backend environment and redeploy.</p>}
        </div>
      )}
    </div>
  );
}

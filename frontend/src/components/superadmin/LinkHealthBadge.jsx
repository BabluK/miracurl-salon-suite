import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Link2, ShieldCheck, ShieldAlert, RefreshCw, Rocket } from "lucide-react";

export function LinkHealthBadge() {
  const [h, setH] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); api.get("/super/link-health").then(r => setH(r.data)).catch(() => setH({ ok: false, base: "", checks: [{ label: "Link health check failed to run", ok: false, detail: "API error" }] })).finally(() => setBusy(false)); };
  useEffect(() => { load(); }, []);
  if (!h) return null;
  const host = h.host || "APP_PUBLIC_URL missing";
  const state = !h.ok ? "bad" : h.deploy_pending ? "deploy" : "good";
  const cls = {
    good: "bg-emerald-500/15 border-emerald-400/40 text-emerald-200",
    deploy: "bg-amber-500/20 border-amber-400/50 text-amber-100",
    bad: "bg-rose-500/20 border-rose-400/50 text-rose-200 animate-pulse",
  }[state];
  const label = state === "bad" ? `Links broken · ${host}` : state === "deploy" ? `Deploy pending · live ${h.live_build}` : `All links point to ${host}`;
  const Icon = state === "bad" ? ShieldAlert : state === "deploy" ? Rocket : ShieldCheck;
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} data-testid="link-health-badge" data-state={state}
        title={state === "bad" ? "Outgoing links may be wrong — click for details" : state === "deploy" ? `Production runs ${h.live_build}; this build is ${h.this_build}. Press Deploy to ship it.` : "Every outgoing link (emails, QR codes, pay links) uses your official domain, and production is on the latest build"}
        className={`text-[10px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${cls}`}>
        <Icon className="w-3 h-3" />
        {label}
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
          {h.this_build && (
            <div className={`mt-2 rounded-lg px-2.5 py-2 text-[10px] ${h.deploy_pending ? "bg-amber-500/15 text-amber-100" : "bg-white/5 text-slate-400"}`} data-testid="link-health-builds">
              <div>This build <b className="text-slate-100">{h.this_build}</b> · production <b className="text-slate-100">{h.live_build || "unknown"}</b></div>
              {h.deploy_pending && <div className="mt-0.5 text-amber-200 font-semibold">Production is behind — press Deploy to ship the latest build.</div>}
              {h.deploy_pending && h.pending?.length > 0 && (
                <div className="mt-2 border-t border-amber-400/20 pt-2" data-testid="deploy-digest">
                  <div className="text-[9px] uppercase tracking-[0.2em] text-amber-300/80 font-semibold mb-1">Waiting to ship · {h.pending.length} build{h.pending.length === 1 ? "" : "s"}</div>
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
                    {h.pending.map(e => (
                      <li key={e.build} className="flex gap-2 text-[10px]" data-testid={`deploy-digest-${e.build}`}>
                        <span className="text-amber-400/70 font-mono shrink-0">.{e.build.split(".")[1]}</span>
                        <span className="text-slate-200">{e.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {!h.ok && <p className="mt-2 text-[10px] text-rose-200/80">Fix: set <code>APP_PUBLIC_URL=https://miracurl-suite.com</code> in the backend environment and redeploy.</p>}
        </div>
      )}
    </div>
  );
}

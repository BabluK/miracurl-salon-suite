import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Rocket, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

// Super Admin banner: what this server has that production doesn't yet.
export function DeployBanner() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const load = (refresh = false) => api.get(`/super/deploy-status${refresh ? "?refresh=1" : ""}`).then(r => setD(r.data)).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  if (!d || d.is_production || !d.live || d.pending_count === 0) return null;
  const n = d.pending_count;
  return (
    <div className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-white to-amber-50 shadow-sm" data-testid="deploy-banner">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><Rocket className="w-4 h-4" /></div>
        <div className="flex-1 min-w-[220px]">
          <div className="text-sm font-semibold text-slate-900" data-testid="deploy-banner-title">{n} change{n === 1 ? "" : "s"} waiting for deployment</div>
          <div className="text-[11px] text-slate-500">This preview is on build <b>{d.here}</b> · live site ({d.prod_url.replace("https://", "")}) is on <b>{d.live}</b>. Use “Deploy” in Emergent to publish.</div>
        </div>
        <button onClick={() => load(true)} className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1" data-testid="deploy-banner-refresh"><RefreshCw className="w-3 h-3" /> Re-check</button>
        <button onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-amber-800 inline-flex items-center gap-1" data-testid="deploy-banner-toggle">
          {open ? <>Hide <ChevronUp className="w-3.5 h-3.5" /></> : <>What's in it <ChevronDown className="w-3.5 h-3.5" /></>}
        </button>
      </div>
      {open && (
        <ul className="px-4 pb-4 space-y-2" data-testid="deploy-banner-list">
          {d.pending.map(e => (
            <li key={e.build} className="text-xs text-slate-700 bg-white/80 border border-amber-100 rounded-xl px-3 py-2">
              <span className="font-mono text-[10px] text-amber-700 mr-2">{e.build}</span>{e.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

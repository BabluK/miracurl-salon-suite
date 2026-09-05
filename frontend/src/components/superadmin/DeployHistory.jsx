import { useEffect, useState } from "react";
import api from "@/lib/api";
import { History, ChevronDown, ChevronUp, Undo2 } from "lucide-react";

const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function DeployHistory() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  useEffect(() => { api.get("/super/deploy-log").then(r => setRows(r.data.deploys)).catch(() => setRows([])); }, []);
  if (!rows) return null;
  return (
    <div className="mt-2 border-t border-white/10 pt-2" data-testid="deploy-history">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400 hover:text-[#d4af37]" data-testid="deploy-history-toggle">
        <span className="inline-flex items-center gap-1"><History className="w-3 h-3" /> Deploy history · {rows.length}</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {rows.length === 0 && <li className="text-[10px] text-slate-500 italic">No deploys recorded yet — the first one appears after production is checked.</li>}
          {rows.map(r => (
            <li key={r.id} className="rounded-lg bg-white/5 border border-white/5 px-2.5 py-1.5" data-testid={`deploy-history-${r.build}`}>
              <button onClick={() => setExpanded(e => (e === r.id ? null : r.id))} className="w-full flex items-center gap-2 text-left">
                <span className={`font-mono text-[10px] font-bold ${r.rollback ? "text-amber-300" : "text-emerald-300"}`}>{r.build}</span>
                {r.rollback && <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-300"><Undo2 className="w-3 h-3" /> rollback</span>}
                <span className="ml-auto text-[10px] text-slate-500 whitespace-nowrap">{when(r.seen_at)}</span>
              </button>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {r.previous_build ? `from ${r.previous_build} · ` : "first recorded · "}{r.shipped?.length || 0} change{(r.shipped?.length || 0) === 1 ? "" : "s"}
              </div>
              {expanded === r.id && r.shipped?.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {r.shipped.map((s, i) => <li key={i} className="text-[10px] text-slate-200 pl-2 border-l border-white/10">{s}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Trophy, Loader2 } from "lucide-react";
import api from "@/lib/api";

const Bar = ({ label, b, win, testid }) => (
  <div className={`rounded-xl border p-3 ${win ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"}`} data-testid={testid}>
    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
      <span>Subject {label}{win && <span className="ml-1.5 inline-flex items-center gap-1 text-emerald-700"><Trophy className="w-3 h-3" /> winning</span>}</span>
      <span className="text-slate-500 font-semibold">{b.sent} sent</span>
    </div>
    <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${win ? "bg-emerald-500" : "bg-[#e8c37f]"}`} style={{ width: `${Math.min(100, b.reply_rate || 0)}%` }} />
    </div>
    <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
      <span>{b.replied} replies · <b className="text-slate-700">{b.reply_rate}%</b></span>
      <span>{b.opened} opened · {b.open_rate}%</span>
    </div>
  </div>
);

// Which subject line gets more replies — Mira sends A or B (50/50 by lead) and this card keeps score per vertical.
export function AbSubjectPanel({ enabled, onToggle }) {
  const [data, setData] = useState(null);
  const [vert, setVert] = useState("salon");
  const load = useCallback(() => api.get("/super-admin/mira/outreach/ab-stats").then(r => setData(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const d = data?.verticals?.[vert];
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-3" data-testid="outreach-ab-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide"><FlaskConical className="w-3.5 h-3.5 text-fuchsia-500" /> A/B subject test</div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer" data-testid="outreach-ab-toggle">
          <input type="checkbox" checked={enabled !== false} onChange={e => onToggle(e.target.checked)} className="accent-fuchsia-600" />
          {enabled !== false ? "On — two subject lines per pitch" : "Off — one subject line"}
        </label>
      </div>
      <div className="flex gap-1.5">
        {[["salon", "💇 Salons"], ["restaurant", "🍽️ Restaurants"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setVert(v)} data-testid={`outreach-ab-vert-${v}`}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vert === v ? "bg-[#1c1c22] text-[#e8c37f] border-[#1c1c22]" : "bg-white text-slate-500 border-slate-200"}`}>{l}</button>
        ))}
        {d && <span className="text-[11px] text-slate-400 self-center ml-1" data-testid="outreach-ab-total">{d.total_sent} A/B sends so far</span>}
      </div>
      {!data && <p className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> loading…</p>}
      {d && (
        <>
          <div className="grid sm:grid-cols-2 gap-2">
            <Bar label="A" b={d.A} win={d.winner === "A"} testid="outreach-ab-a" />
            <Bar label="B" b={d.B} win={d.winner === "B"} testid="outreach-ab-b" />
          </div>
          {d.recent?.length > 0 && (
            <div className="space-y-1" data-testid="outreach-ab-recent">
              {d.recent.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-slate-600 truncate">
                  <span className={`shrink-0 w-4 h-4 rounded text-[9px] font-bold inline-flex items-center justify-center ${r.variant === "A" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>{r.variant}</span>
                  <span className="truncate">{r.subject}</span>
                  <span className="shrink-0 text-slate-400">· {r.name}</span>
                  {r.replied && <span className="shrink-0 text-emerald-600 font-semibold">💬 replied</span>}
                  {!r.replied && r.opened && <span className="shrink-0 text-sky-500">👀</span>}
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-400">{data.note}</p>
        </>
      )}
    </div>
  );
}

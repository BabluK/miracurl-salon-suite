import { useCallback, useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { TrendingUp } from "lucide-react";
import api from "@/lib/api";

const RIVAL_COLORS = ["#0ea5e9", "#8b5cf6", "#f43f5e", "#14b8a6", "#f97316", "#64748b"];
const OURS_COLOR = "#b8932e";
const MONTH_LBL = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const TIP_STYLE = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 11 };

// HQ → Billing: month-over-month competitor pricing vs ours (one point per monthly Mira check).
export function CompetitorTrendCard() {
  const [d, setD] = useState(null);
  const [seg, setSeg] = useState("salon");
  const load = useCallback(() => api.get("/super-admin/competitor-watch/history").then(r => setD(r.data)).catch(() => setD({ rows: [], series: [] })), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener("competitor-watch-updated", load);
    return () => window.removeEventListener("competitor-watch-updated", load);
  }, [load]);
  if (!d) return null;
  const series = (d.series || []).filter(s => s.segment === seg);
  const rows = d.rows || [];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="competitor-trend-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Month-over-month · lowest monthly USD</div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#b8932e]" /> Competitor price trend</h3>
          <p className="text-xs text-slate-500 mt-1">Each monthly check adds a point — spot rivals cutting prices before they undercut us.</p>
        </div>
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-slate-100 border border-slate-200" data-testid="competitor-trend-seg">
          {[["salon", "Salons"], ["restaurant", "Restaurants"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSeg(k)} data-testid={`competitor-trend-seg-${k}`}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${seg === k ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 h-40 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400" data-testid="competitor-trend-empty">
          No checks yet — run "Re-check now" above to add the first point.
        </div>
      ) : (
        <div className="h-64 mt-4" data-testid="competitor-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickFormatter={MONTH_LBL} />
              <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={v => `$${v}`} domain={[0, "auto"]} />
              <Tooltip contentStyle={TIP_STYLE} labelFormatter={MONTH_LBL} formatter={(v) => `$${Number(v).toFixed(2)}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s, i) => (
                <Line key={s.key} type="monotone" dataKey={s.key} connectNulls
                  stroke={s.ours ? OURS_COLOR : RIVAL_COLORS[i % RIVAL_COLORS.length]}
                  strokeWidth={s.ours ? 3.5 : 2} dot={{ r: s.ours ? 5 : 3 }} activeDot={{ r: 6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="text-[10px] text-slate-400 mt-2" data-testid="competitor-trend-months">
        {rows.length} month{rows.length === 1 ? "" : "s"} of data{rows.length === 1 ? " · trend lines appear from the second monthly check" : ""} · gold line = Miracurl
      </div>
    </div>
  );
}

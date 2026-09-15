import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { HandCoins } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, LabelList, Cell } from "recharts";
import { RangeChips } from "./RangeChips";

const RANGES = [
  { k: "today", label: "Today", days: 0 },
  { k: "week", label: "Last 7 days", days: 6 },
  { k: "month", label: "Last 30 days", days: 29 },
];
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export function TipsReportCard({ restaurant }) {
  const [range, setRange] = useState("week");
  const [data, setData] = useState(null);

  const load = useCallback(async (rk) => {
    const r = RANGES.find(x => x.k === rk) || RANGES[1];
    const end = new Date().toLocaleDateString("en-CA");
    const start = new Date(Date.now() - r.days * 86400000).toLocaleDateString("en-CA");
    try {
      const { data: d } = await api.get("/reports/tips", { params: { start, end } });
      setData(d);
    } catch { setData(null); }
  }, []);
  useEffect(() => { load(range); }, [range, load]);

  const byDay = {};
  (data?.rows || []).forEach(r => Object.entries(r.days || {}).forEach(([d, v]) => { byDay[d] = (byDay[d] || 0) + v; }));
  const chart = Object.keys(byDay).sort().slice(-14).map(d => ({ d, label: new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" }), day: d.slice(8), v: byDay[d] }));

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5" data-testid="tips-report-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-[#9b3a4e] flex items-center justify-center flex-shrink-0"><HandCoins className="w-5 h-5" /></div>
          <div>
            <h3 className="font-playfair text-2xl text-slate-900">Tip payouts by {restaurant ? "chef" : "stylist"}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Track and reward your talented team.</p>
          </div>
        </div>
        <RangeChips ranges={RANGES} value={range} onChange={setRange} testPrefix="tips-range" />
      </div>
      {!data || !data.rows?.length ? (
        <p className="text-sm text-slate-400 mt-5" data-testid="tips-empty">No tips recorded in this period yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 mt-5 items-center">
          <div>
            <div className="font-playfair text-4xl sm:text-5xl text-slate-900" data-testid="tips-grand-total">{inr(data.grand_total)}</div>
            <div className="text-sm text-slate-500 mt-1">Total tips paid</div>
            <div className="text-[11px] text-slate-400 mt-1">{data.start} → {data.end}</div>
            <div className="mt-4 space-y-2">
              {data.rows.slice(0, 5).map(r => (
                <div key={r.staff_id} className="flex items-center gap-2 text-sm" data-testid={`tips-row-${r.staff_id}`}>
                  <span className="w-7 h-7 rounded-full bg-rose-100 text-[#9b3a4e] font-bold text-xs flex items-center justify-center shrink-0">{(r.staff_name || "?").charAt(0)}</span>
                  <span className="flex-1 truncate text-slate-700">{r.staff_name}</span>
                  <span className="font-semibold text-slate-800">{inr(r.total)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey={chart.length > 7 ? "day" : "label"} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <Bar dataKey="v" radius={[8, 8, 4, 4]} isAnimationActive={false}>
                  {chart.map((c, i) => <Cell key={c.d} fill={i % 2 ? "#c2536a" : "#a83d54"} />)}
                  <LabelList dataKey="v" position="top" formatter={(v) => inr(v)} style={{ fontSize: 11, fill: "#475569", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

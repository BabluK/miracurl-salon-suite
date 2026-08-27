import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { HandCoins } from "lucide-react";

const RANGES = [
  { k: "today", label: "Today", days: 0 },
  { k: "week", label: "Last 7 days", days: 6 },
  { k: "month", label: "Last 30 days", days: 29 },
];

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

  const who = restaurant ? "chef" : "stylist";
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="tips-report-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <HandCoins className="w-4 h-4 text-amber-600" /> Tip payouts by {who}
        </h3>
        <div className="flex gap-1.5">
          {RANGES.map(r => (
            <button key={r.k} onClick={() => setRange(r.k)} data-testid={`tips-range-${r.k}`}
              className={`px-3 py-1 rounded-full text-xs border transition ${range === r.k ? "bg-slate-900 text-amber-300 border-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {!data || !data.rows?.length ? (
        <p className="text-sm text-slate-400 mt-4" data-testid="tips-empty">No tips recorded in this period yet.</p>
      ) : (
        <>
          <div className="text-xs text-slate-400 mt-1">{data.start} → {data.end} · total <span className="font-bold text-slate-700">₹{data.grand_total.toLocaleString("en-IN")}</span></div>
          <div className="mt-3 divide-y divide-slate-100">
            {data.rows.map(r => (
              <div key={r.staff_id} className="py-2.5 flex items-center gap-3" data-testid={`tips-row-${r.staff_id}`}>
                <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center shrink-0">
                  {(r.staff_name || "?").charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{r.staff_name}</div>
                  <div className="text-[11px] text-slate-400">{r.count} tip{r.count === 1 ? "" : "s"} · {Object.entries(r.days).slice(-4).map(([d, v]) => `${d.slice(5)}: ₹${v}`).join(" · ")}</div>
                </div>
                <div className="text-sm font-bold text-emerald-600 shrink-0">₹{r.total.toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

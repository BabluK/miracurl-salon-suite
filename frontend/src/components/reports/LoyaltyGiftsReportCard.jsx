import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Gift } from "lucide-react";

const RANGES = [
  { k: "week", label: "Last 7 days", days: 6 },
  { k: "month", label: "Last 30 days", days: 29 },
  { k: "quarter", label: "Last 90 days", days: 89 },
];

export function LoyaltyGiftsReportCard() {
  const [range, setRange] = useState("month");
  const [data, setData] = useState(null);

  const load = useCallback(async (rk) => {
    const r = RANGES.find(x => x.k === rk) || RANGES[1];
    const end = new Date().toLocaleDateString("en-CA");
    const start = new Date(Date.now() - r.days * 86400000).toLocaleDateString("en-CA");
    try {
      const { data: d } = await api.get("/reports/loyalty-gifts", { params: { start, end } });
      setData(d);
    } catch { setData(null); }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  if (!data) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="loyalty-gifts-report-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-500" /> Loyalty gifts given
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Every surprise gift handed out on a full stamp card — {data.total} in this period</p>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r.k} onClick={() => setRange(r.k)} data-testid={`gifts-range-${r.k}`}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${range === r.k ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-500 hover:border-amber-400"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {data.rows.length === 0 ? (
        <p className="text-sm text-slate-400 mt-4">No gifts redeemed in this period yet.</p>
      ) : (
        <div className="mt-4 divide-y divide-slate-100">
          {data.rows.map(r => (
            <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap" data-testid="gift-log-row">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">🎁 {r.gift}</p>
                <p className="text-[11px] text-slate-500">{r.customer_name || "Guest"} · {r.phone} · by {r.redeemed_by}</p>
              </div>
              <span className="text-[11px] text-slate-400 shrink-0">
                {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Gift, Sparkles, Scissors, Ticket, Gem } from "lucide-react";
import { RangeChips } from "./RangeChips";
import { SectionCard } from "./SectionCard";

const RANGES = [
  { k: "week", label: "Last 7 days", days: 6 },
  { k: "month", label: "Last 30 days", days: 29 },
  { k: "quarter", label: "Last 90 days", days: 89 },
];
const ICONS = [[/spa|treat|mask/i, Sparkles, "text-amber-600 bg-amber-50"], [/cut|trim|hair/i, Scissors, "text-[#9b3a4e] bg-rose-50"],
  [/voucher|discount|off|coupon/i, Ticket, "text-sky-600 bg-sky-50"], [/premium|upgrade|gold|vip/i, Gem, "text-violet-600 bg-violet-50"]];
const iconFor = (name) => ICONS.find(([rx]) => rx.test(name || "")) || [null, Gift, "text-emerald-600 bg-emerald-50"];

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
  const groups = Object.entries(data.rows.reduce((a, r) => { a[r.gift] = (a[r.gift] || 0) + 1; return a; }, {})).sort((x, y) => y[1] - x[1]);

  return (
    <SectionCard icon={Gift} tone="amber" title="Loyalty gifts given" subtitle="Delight your customers, build lasting relationships." testid="loyalty-gifts-report-card"
      right={<RangeChips ranges={RANGES} value={range} onChange={setRange} testPrefix="gifts-range" tone="amber" />}>
      {data.rows.length === 0 ? (
        <p className="text-sm text-slate-400 mt-5">No gifts redeemed in this period yet.</p>
      ) : (
        <div className="flex items-start gap-5 mt-5 flex-wrap">
          <div className="min-w-[120px]">
            <div className="font-playfair text-4xl sm:text-5xl text-slate-900" data-testid="gifts-total">{data.total}</div>
            <div className="text-sm text-slate-500 mt-1">Gifts given</div>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {groups.slice(0, 8).map(([gift, n]) => {
              const [, Icon, cls] = iconFor(gift);
              return (
                <div key={gift} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4" data-testid="gift-group-tile">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls}`}><Icon className="w-5 h-5" /></div>
                  <div className="font-playfair text-2xl text-slate-900 mt-3">{n}</div>
                  <div className="text-xs text-slate-500 truncate" title={gift}>{gift}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {data.rows.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {data.rows.slice(0, 5).map(r => (
            <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap text-sm" data-testid="gift-log-row">
              <span className="text-slate-700"><span className="font-semibold text-slate-800">{r.gift}</span> · {r.customer_name || "Guest"} · {r.phone} <span className="text-slate-400">by {r.redeemed_by}</span></span>
              <span className="text-[11px] text-slate-400 shrink-0">{new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

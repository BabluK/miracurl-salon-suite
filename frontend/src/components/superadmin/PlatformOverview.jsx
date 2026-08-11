import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CheckCircle2, XCircle, Crown } from "lucide-react";

const SEG = [
  { k: "active", label: "Active", color: "#34d399" },
  { k: "trial", label: "Trial", color: "#60a5fa" },
  { k: "expiring", label: "Expiring Soon", color: "#fbbf24" },
  { k: "cancelled", label: "Cancelled", color: "#fb7185" },
];
const CHIP = {
  active: "bg-emerald-100 text-emerald-700", trial: "bg-sky-100 text-sky-700",
  expiring: "bg-amber-100 text-amber-700", cancelled: "bg-rose-100 text-rose-700",
  suspended: "bg-rose-100 text-rose-700",
};

function Donut({ subs }) {
  const total = Math.max(1, subs.total || 0);
  const C = 2 * Math.PI * 42;
  let offset = 0;
  return (
    <div className="relative w-36 h-36 shrink-0">
      <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
        {SEG.map(s => {
          const frac = (subs[s.k] || 0) / total;
          const dash = `${frac * C} ${C}`;
          const el = <circle key={s.k} cx="50" cy="50" r="42" fill="none" stroke={s.color} strokeWidth="12"
            strokeDasharray={dash} strokeDashoffset={-offset * C} strokeLinecap="butt" />;
          offset += frac;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-800" data-testid="overview-total">{subs.total}</span>
        <span className="text-[10px] text-slate-400">Total</span>
      </div>
    </div>
  );
}

export function PlatformOverview({ onGoTab }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/super-admin/platform-overview").then(r => setD(r.data)).catch(() => {}); }, []);
  if (!d) return null;
  const subs = d.subscriptions;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="platform-overview">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Subscription Status</h3>
        <div className="flex items-center gap-6">
          <Donut subs={subs} />
          <div className="space-y-2 flex-1">
            {SEG.map(s => (
              <div key={s.k} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-slate-600">{s.label}</span>
                <span className="ml-auto font-semibold text-slate-800" data-testid={`overview-${s.k}`}>
                  {subs[s.k] || 0} <span className="text-[10px] text-slate-400 font-normal">({Math.round(((subs[s.k] || 0) / Math.max(1, subs.total)) * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <button onClick={() => onGoTab?.("billing")} className="text-xs text-sky-600 hover:underline mt-3" data-testid="overview-view-subs">View all subscriptions →</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">Recent Companies</h3>
          <button onClick={() => onGoTab?.("tenants")} className="text-xs px-3 py-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">View All</button>
        </div>
        <div className="space-y-2.5">
          {d.recent.map((t, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-100 to-amber-100 flex items-center justify-center text-xs font-bold text-fuchsia-600">{(t.name || "?").charAt(0)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{t.location || "—"}</p>
              </div>
              <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize ${CHIP[t.status] || "bg-slate-100 text-slate-600"}`}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-800 mb-3">System Health</h3>
        <div className="divide-y divide-slate-100">
          {d.health.map(h => (
            <div key={h.name} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-slate-600">{h.name}</span>
              {h.ok
                ? <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Operational</span>
                : <span className="flex items-center gap-1 text-rose-600 text-xs font-semibold"><XCircle className="w-3.5 h-3.5" /> Down</span>}
            </div>
          ))}
        </div>
        {d.all_ok && <p className="text-center text-xs text-emerald-600 mt-2">✓ All systems are running smoothly</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">Top Revenue Companies</h3>
          <span className="text-[10px] px-3 py-1 rounded-full border border-slate-200 text-slate-500">This Month</span>
        </div>
        {d.top_revenue.length === 0 ? <p className="text-xs text-slate-300 text-center py-6">No billing yet this month</p> : (
          <div className="space-y-2.5">
            {d.top_revenue.map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center ${i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
                {i === 0 && <Crown className="w-3.5 h-3.5 text-amber-500 -ml-1" />}
                <p className="text-sm font-medium text-slate-800 truncate flex-1">{t.name}</p>
                <span className="text-sm font-bold text-slate-800">₹{Number(t.revenue).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => onGoTab?.("revenue")} className="text-xs text-sky-600 hover:underline mt-3" data-testid="overview-full-report">View full report →</button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Crown } from "lucide-react";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const TIER_CHIP = {
  silver: "bg-slate-100 text-slate-700", gold: "bg-amber-100 text-amber-800",
  platinum: "bg-violet-100 text-violet-700", diamond: "bg-cyan-100 text-cyan-700",
  custom: "bg-orange-100 text-orange-700",
};

export function MembershipReportCard() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/reports/memberships").then(r => setD(r.data)).catch(() => {});
  }, []);
  if (!d || d.members_total === 0) return null;

  return (
    <div className="card-light" data-testid="membership-report-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center"><Crown className="w-4 h-4" /></div>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Premium Memberships</h3>
          <p className="text-[11px] text-slate-500">Sales, active members & wallet cashback liability</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Total sales" value={inr(d.sales_total)} accent="text-emerald-600" testid="mem-sales-total" />
        <Stat label="This month" value={inr(d.sales_this_month)} testid="mem-sales-month" />
        <Stat label="Active members" value={d.members_active} accent="text-sky-600" testid="mem-active" />
        <Stat label="Expiring ≤30 days" value={d.expiring_in_30_days} accent={d.expiring_in_30_days ? "text-amber-600" : ""} testid="mem-expiring" />
        <Stat label="Cashback credited" value={inr(d.cashback_credited_total)} testid="mem-cashback" />
        <Stat label="Wallet liability" value={inr(d.wallet_liability_active_members)} accent="text-rose-500"
          hint="Unspent wallet balance of active members" testid="mem-liability" />
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-slate-500">
        <span>🌐 {d.online} online · 🏪 {d.pos} at salon</span>
        <span className="text-slate-300">|</span>
        {Object.entries(d.active_by_tier || {}).map(([tier, n]) => (
          <span key={tier} className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${TIER_CHIP[tier] || "bg-slate-100 text-slate-600"}`}>
            {tier} × {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-slate-800", hint, testid }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3" data-testid={testid} title={hint || ""}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className={`text-lg font-bold mt-1 ${accent}`}>{value}</div>
    </div>
  );
}

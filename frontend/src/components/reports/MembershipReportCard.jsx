import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Crown, Wallet, CalendarDays, Users, Clock, Coins, HandCoins, ArrowRight } from "lucide-react";
import { SectionCard, TH, THEAD, TR, TD, StatusPill } from "./SectionCard";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const TIER_CHIP = {
  silver: "bg-slate-100 text-slate-700", gold: "bg-amber-100 text-amber-800",
  platinum: "bg-violet-100 text-violet-700", diamond: "bg-cyan-100 text-cyan-700", custom: "bg-orange-100 text-orange-700",
};
const fmt = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function MembershipReportCard() {
  const [d, setD] = useState(null);
  const [members, setMembers] = useState([]);
  useEffect(() => {
    api.get("/reports/memberships").then(r => setD(r.data)).catch(() => {});
    api.get("/premium-membership/members").then(r => setMembers(r.data.members || [])).catch(() => {});
  }, []);
  if (!d || d.members_total === 0) return null;

  const stats = [
    [Wallet, "violet", "Total sales", inr(d.sales_total), "mem-sales-total"],
    [CalendarDays, "violet", "This month", inr(d.sales_this_month), "mem-sales-month"],
    [Users, "sky", "Active members", d.members_active, "mem-active"],
    [Clock, "amber", "Expiring ≤30 days", d.expiring_in_30_days, "mem-expiring"],
    [Coins, "amber", "Cashback credited", inr(d.cashback_credited_total), "mem-cashback"],
    [HandCoins, "rose", "Wallet liability", inr(d.wallet_liability_active_members), "mem-liability"],
  ];
  const tone = { violet: "bg-violet-50 text-violet-600", sky: "bg-sky-50 text-sky-600", amber: "bg-amber-50 text-amber-600", rose: "bg-rose-50 text-rose-500" };

  return (
    <SectionCard icon={Crown} tone="amber" title="Premium Memberships" subtitle="Sales, active members & wallet cashback liability." testid="membership-report-card"
      right={<Link to="/plans?tab=memberships" data-testid="mem-view-members" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#9b3a4e]/30 text-sm font-medium text-[#7f2d3f] hover:bg-[#fdf6f7]">View Members <ArrowRight className="w-4 h-4" /></Link>}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
        {stats.map(([Icon, t, label, value, testid]) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 flex items-center gap-3" data-testid={testid}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tone[t]}`}><Icon className="w-5 h-5" /></div>
            <div className="min-w-0"><div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">{label}</div>
              <div className={`font-playfair text-2xl leading-tight truncate ${t === "rose" ? "text-[#9b3a4e]" : "text-slate-900"}`}>{value}</div></div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-slate-500">
        <span>🌐 {d.online} online · 🏪 {d.pos} at salon</span>
        {Object.entries(d.active_by_tier || {}).map(([tier, n]) => (
          <span key={tier} className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${TIER_CHIP[tier] || "bg-slate-100 text-slate-600"}`}>{tier} × {n}</span>
        ))}
      </div>
      {members.length > 0 && (
        <div className="mt-5 rounded-2xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3"><h4 className="font-playfair text-lg text-slate-900">Recent Membership Activity</h4>
            <Link to="/plans?tab=memberships" className="text-xs font-semibold text-[#7f2d3f] inline-flex items-center gap-1">View All <ArrowRight className="w-3.5 h-3.5" /></Link></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead className={THEAD}><tr><th className={TH}>Customer</th><th className={TH}>Membership plan</th><th className={TH}>Start date</th><th className={TH}>Expiry date</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Amount</th></tr></thead>
            <tbody>{members.slice(0, 5).map(m => (
              <tr key={m.member_id || m.customer_name + m.purchased_at} className={TR} data-testid={`mem-row-${m.member_id}`}>
                <td className={TD}><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center font-semibold text-xs">{(m.customer_name || "?").charAt(0)}</div>
                  <div><div className="font-medium text-slate-800">{m.customer_name}</div>{m.phone && <div className="text-xs text-slate-400">{m.phone}</div>}</div></div></td>
                <td className={TD}><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${TIER_CHIP[m.tier] || "bg-slate-100 text-slate-600"}`}><Crown className="w-3 h-3" /> {m.plan}</span></td>
                <td className={`${TD} text-slate-600`}>{fmt(m.purchased_at)}</td>
                <td className={`${TD} text-slate-600`}>{fmt(m.expires_at)}</td>
                <td className={TD}><StatusPill tone={m.status === "active" ? "emerald" : "slate"}>{m.status === "active" ? "Active" : "Expired"}</StatusPill></td>
                <td className={`${TD} text-right font-semibold text-slate-800`}>{inr(m.amount)}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
      )}
    </SectionCard>
  );
}

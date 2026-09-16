import { useState } from "react";
import { Wallet, Crown, CalendarCheck, Receipt, Smartphone, CreditCard, Trophy, CalendarRange } from "lucide-react";

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "4d", label: "Last 4 days" },
  { key: "7d", label: "Last 7 days" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
];

const chip = (on) => `text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
  on ? "bg-[#e8c56a] border-[#e8c56a] text-[#1a1408] font-semibold" : "bg-white/5 border-white/15 text-white/65 hover:text-white hover:border-[#e8c56a]/60"}`;
const dateCls = "bg-transparent text-[11px] text-white/85 outline-none [color-scheme:dark] w-[7.6rem]";

export function PeriodPicker({ cur, range, busy, onPick, onRange }) {
  const [draft, setDraft] = useState(range);
  const maxIso = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const isMonth = /^\d{4}-\d{2}$/.test(cur);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="group-period-chips">
      {PERIODS.map(p => (
        <button key={p.key} data-testid={`group-period-${p.key}`} disabled={busy} onClick={() => onPick(p.key)} className={chip(cur === p.key)}>{p.label}</button>
      ))}
      <label className={`inline-flex items-center gap-1.5 cursor-pointer ${chip(isMonth)}`} title="Pick any month">
        <span>Month</span>
        <input data-testid="group-period-custom-month" type="month" max={maxIso.slice(0, 7)} value={isMonth ? cur : ""}
          onChange={e => e.target.value && onPick(e.target.value)} disabled={busy} className={dateCls} />
      </label>
      <div className={`inline-flex items-center gap-1.5 ${chip(cur === "custom")} !py-1`} data-testid="group-period-range">
        <CalendarRange className="w-3.5 h-3.5 opacity-70" />
        <input data-testid="group-range-from" type="date" max={maxIso} value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} className={dateCls} />
        <span className="opacity-60">to</span>
        <input data-testid="group-range-to" type="date" max={maxIso} value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} className={dateCls} />
        <button data-testid="group-range-apply" disabled={busy || !draft.from || !draft.to} onClick={() => onRange(draft)}
          className="ml-1 px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40">Go</button>
      </div>
    </div>
  );
}

const TONE = {
  gold: "from-[#3a2a0c] to-[#1c1508] border-[#e8c56a]/40 [--ic:#e8c56a]",
  green: "from-[#0f2a1e] to-[#0b1a13] border-emerald-400/35 [--ic:#34d399]",
  blue: "from-[#0f1f3a] to-[#0b1426] border-sky-400/35 [--ic:#60a5fa]",
  violet: "from-[#241538] to-[#160d24] border-violet-400/35 [--ic:#a78bfa]",
  rose: "from-[#3a1224] to-[#240b17] border-pink-400/35 [--ic:#f472b6]",
  amber: "from-[#33200a] to-[#1f1406] border-amber-400/35 [--ic:#fbbf24]",
};
function Kpi({ icon: Icon, label, value, sub, testid, tone = "gold" }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br border px-4 py-3.5 flex items-start gap-3 min-w-0 shadow-[0_18px_40px_-24px_rgba(0,0,0,.9)] ${TONE[tone]}`} data-testid={testid}>
      <div className="w-10 h-10 rounded-xl bg-white/[.08] flex items-center justify-center shrink-0" style={{ color: "var(--ic)" }}><Icon className="w-5 h-5" strokeWidth={1.7} /></div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[.16em] text-white/55">{label}</div>
        <div className="font-playfair text-2xl leading-tight truncate mt-0.5">{value}</div>
        {sub && <div className="text-[11px] text-white/45 truncate">{sub}</div>}
      </div>
    </div>
  );
}

export function GroupKpis({ data, inr }) {
  const top = data.top_stylist;
  return (
    <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="group-kpis">
      <Kpi tone="gold" icon={Wallet} label="Total Cash" value={inr(data.total_cash)} sub={`UPI ${inr(data.total_upi)} · Card ${inr(data.total_card)}`} testid="group-kpi-cash" />
      <Kpi tone="green" icon={Smartphone} label="UPI" value={inr(data.total_upi)} testid="group-kpi-upi" />
      <Kpi tone="blue" icon={CreditCard} label="Card" value={inr(data.total_card)} testid="group-kpi-card" />
      <Kpi tone="violet" icon={CalendarCheck} label="Total Bookings" value={data.total_bookings || 0} testid="group-kpi-bookings" />
      <Kpi tone="amber" icon={Receipt} label="Total Bills" value={data.total_bills || 0} testid="group-kpi-bills" />
      <Kpi tone="rose" icon={Crown} label="Top Stylist" value={top ? top.name.split(" ")[0] : "—"} sub={top ? `${inr(top.revenue)} · ${top.services} services` : "No services billed"} testid="group-kpi-top-stylist" />
    </div>
  );
}

const Mini = ({ label, value, testid }) => (
  <div className="rounded-xl bg-black/25 px-3 py-2 min-w-0" data-testid={testid}>
    <div className="text-[9px] uppercase tracking-[.16em] text-white/45">{label}</div>
    <div className="text-sm font-semibold truncate mt-0.5">{value}</div>
  </div>
);

export function BranchCard({ s, rank, showAvg, inr }) {
  const top = s.top_stylist;
  return (
    <div data-testid={`my-salon-card-${s.slug}`}
      className={`relative rounded-2xl p-4 border transition-colors ${s.active ? "bg-white/[.09] border-[#e8c56a]/50" : "bg-white/[.04] border-white/10 hover:border-white/25"}`}>
      {rank === 0 && s.today > 0 && (
        <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] font-bold uppercase tracking-wider" data-testid={`my-salon-leader-${s.slug}`}>
          <Trophy className="w-3 h-3" /> Leading branch
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-[#1a1408]">
          <img src={s.logo_url || "/assets/dashboard/hero-salon.jpg"} alt="" className={`w-full h-full ${s.logo_url ? "object-contain p-1" : "object-cover"}`} onError={e => { e.currentTarget.src = "/assets/dashboard/hero-salon.jpg"; e.currentTarget.className = "w-full h-full object-cover"; }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-playfair text-lg leading-tight truncate">{s.name}</p>
            {s.active && <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 uppercase tracking-wider shrink-0">Active</span>}
          </div>
          <p className="text-[11px] text-white/50 truncate">{s.location || s.slug}</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-playfair text-3xl text-[#f3e5ab]" data-testid={`my-salon-today-${s.slug}`}>{inr(s.today)}</span>
            {showAvg && s.invoices_today > 0 && <span className="text-[11px] text-white/45">avg {inr(Math.round(s.today / s.invoices_today))}/bill</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Mini label="Total Cash" value={inr(s.cash)} testid={`my-salon-cash-${s.slug}`} />
        <Mini label="UPI · Card" value={`${inr(s.upi)} · ${inr(s.card)}`} testid={`my-salon-digital-${s.slug}`} />
        <Mini label="Total Bookings" value={s.appointments_today} testid={`my-salon-bookings-${s.slug}`} />
        <Mini label="Total Bills" value={s.invoices_today} testid={`my-salon-bills-${s.slug}`} />
      </div>
      <div className="mt-2 rounded-xl bg-[#e8c56a]/10 border border-[#e8c56a]/20 px-3 py-2 flex items-center gap-2" data-testid={`my-salon-top-stylist-${s.slug}`}>
        <Crown className="w-4 h-4 text-[#e8c56a] shrink-0" />
        <div className="min-w-0 text-[12px]">
          <span className="text-white/55">Top stylist · </span>
          {top ? <span className="font-semibold">{top.name} <span className="text-white/55 font-normal">{inr(top.revenue)} · {top.services} services</span></span> : <span className="text-white/45">No services billed</span>}
        </div>
      </div>
    </div>
  );
}

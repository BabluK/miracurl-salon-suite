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

const chip = (on) => `text-[11px] px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
  on ? "bg-[#e8c56a] border-[#e8c56a] text-[#1a1408] font-semibold" : "bg-white/70 border-[#eadbc3] text-slate-600 hover:text-slate-900 hover:border-[#c99a2e]"}`;
const dateCls = "bg-transparent text-[11px] text-slate-700 outline-none w-[7.4rem] max-w-[38vw]";

export function PeriodPicker({ cur, range, busy, onPick, onRange }) {
  const [draft, setDraft] = useState(range);
  const maxIso = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const isMonth = /^\d{4}-\d{2}$/.test(cur);
  return (
    <div className="mt-4 sm:mt-5 space-y-2" data-testid="group-period-chips">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PERIODS.map(p => (
          <button key={p.key} data-testid={`group-period-${p.key}`} disabled={busy} onClick={() => onPick(p.key)} className={chip(cur === p.key)}>{p.label}</button>
        ))}
        <label className={`inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${chip(isMonth)}`} title="Pick any month">
          <span>Month</span>
          <input data-testid="group-period-custom-month" type="month" max={maxIso.slice(0, 7)} value={isMonth ? cur : ""}
            onChange={e => e.target.value && onPick(e.target.value)} disabled={busy} className={`${dateCls} w-[6.5rem]`} />
        </label>
      </div>
      <div className={`inline-flex items-center gap-1.5 max-w-full flex-wrap ${chip(cur === "custom")} !py-1`} data-testid="group-period-range">
        <CalendarRange className="w-3.5 h-3.5 opacity-70 shrink-0" />
        <input data-testid="group-range-from" type="date" max={maxIso} value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} className={dateCls} />
        <span className="opacity-60">to</span>
        <input data-testid="group-range-to" type="date" max={maxIso} value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} className={dateCls} />
        <button data-testid="group-range-apply" disabled={busy || !draft.from || !draft.to} onClick={() => onRange(draft)}
          className="ml-1 px-2.5 py-0.5 rounded-full bg-[#1a1408] text-white hover:bg-black text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40">Go</button>
      </div>
    </div>
  );
}

const TONE = {
  gold: "from-[#fff7e6] to-[#fbeccb] border-[#e8c56a]/60 [--ic:#b8862b]",
  green: "from-[#ecfdf5] to-[#d6f5e6] border-emerald-300 [--ic:#059669]",
  blue: "from-[#eff6ff] to-[#dbeafe] border-sky-300 [--ic:#0284c7]",
  violet: "from-[#f5f3ff] to-[#ede9fe] border-violet-300 [--ic:#7c3aed]",
  rose: "from-[#fff1f5] to-[#fde2ea] border-pink-300 [--ic:#db2777]",
  amber: "from-[#fffbeb] to-[#fef3c7] border-amber-300 [--ic:#d97706]",
};
function Kpi({ icon: Icon, label, value, sub, testid, tone = "gold" }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br border px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-start gap-3 min-w-0 shadow-[0_14px_30px_-22px_rgba(120,80,20,.5)] ${TONE[tone]}`} data-testid={testid}>
      <div className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center shrink-0" style={{ color: "var(--ic)" }}><Icon className="w-5 h-5" strokeWidth={1.7} /></div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[.16em] text-slate-500">{label}</div>
        <div className="font-playfair text-xl sm:text-2xl leading-tight truncate mt-0.5 text-slate-900">{value}</div>
        {sub && <div className="text-[11px] text-slate-500 truncate">{sub}</div>}
      </div>
    </div>
  );
}

export function GroupKpis({ data, inr }) {
  const top = data.top_stylist;
  return (
    <div className="mt-4 sm:mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3" data-testid="group-kpis">
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
  <div className="rounded-xl bg-white/75 border border-[#f1e6d3] px-3 py-2 min-w-0" data-testid={testid}>
    <div className="text-[9px] uppercase tracking-[.16em] text-slate-500">{label}</div>
    <div className="text-sm font-semibold truncate mt-0.5 text-slate-800">{value}</div>
  </div>
);

export function BranchCard({ s, rank, showAvg, inr, leader = true }) {
  const top = s.top_stylist;
  return (
    <div data-testid={`my-salon-card-${s.slug}`}
      className={`relative rounded-2xl p-4 border transition-colors bg-white/60 ${s.active ? "border-[#c99a2e]/70 shadow-[0_12px_30px_-20px_rgba(180,130,60,.6)]" : "border-[#eadbc3] hover:border-[#c99a2e]/50"}`}>
      {leader && rank === 0 && s.today > 0 && (
        <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] font-bold uppercase tracking-wider" data-testid={`my-salon-leader-${s.slug}`}>
          <Trophy className="w-3 h-3" /> Leading branch
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-[#eadbc3] shrink-0 bg-[#1a1408]">
          <img src={s.logo_url || "/assets/dashboard/hero-salon.jpg"} alt="" className={`w-full h-full ${s.logo_url ? "object-contain p-1" : "object-cover"}`} onError={e => { e.currentTarget.src = "/assets/dashboard/hero-salon.jpg"; e.currentTarget.className = "w-full h-full object-cover"; }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-playfair text-base sm:text-lg leading-tight text-slate-900 break-words">{s.name}</p>
            {s.active && <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 uppercase tracking-wider shrink-0">Active</span>}
          </div>
          <p className="text-[11px] text-slate-500 truncate">{s.location || s.slug}</p>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="font-playfair text-2xl sm:text-3xl text-[#8a6a1f]" data-testid={`my-salon-today-${s.slug}`}>{inr(s.today)}</span>
            {showAvg && s.invoices_today > 0 && <span className="text-[11px] text-slate-500">avg {inr(Math.round(s.today / s.invoices_today))}/bill</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Mini label="Total Cash" value={inr(s.cash)} testid={`my-salon-cash-${s.slug}`} />
        <Mini label="UPI · Card" value={`${inr(s.upi)} · ${inr(s.card)}`} testid={`my-salon-digital-${s.slug}`} />
        <Mini label="Total Bookings" value={s.appointments_today} testid={`my-salon-bookings-${s.slug}`} />
        <Mini label="Total Bills" value={s.invoices_today} testid={`my-salon-bills-${s.slug}`} />
      </div>
      <div className="mt-2 rounded-xl bg-[#fbeed2]/70 border border-[#e8c56a]/40 px-3 py-2 flex items-center gap-2" data-testid={`my-salon-top-stylist-${s.slug}`}>
        <Crown className="w-4 h-4 text-[#b8862b] shrink-0" />
        <div className="min-w-0 text-[12px] text-slate-800">
          <span className="text-slate-500">Top stylist · </span>
          {top ? <span className="font-semibold">{top.name} <span className="text-slate-500 font-normal">{inr(top.revenue)} · {top.services} services</span></span> : <span className="text-slate-500">No services billed</span>}
        </div>
      </div>
    </div>
  );
}

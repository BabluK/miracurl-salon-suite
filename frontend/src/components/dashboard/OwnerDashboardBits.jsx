import { useState } from "react";
import { KeyRound, Link as LinkIcon, Copy, ExternalLink, IndianRupee, Receipt, CalendarDays, BarChart3, Crown, Smartphone, CreditCard, Wallet } from "lucide-react";
import { toast } from "sonner";

export function PinDialog({ title, hint, confirmLabel = "Unlock", danger = false, busy = false, onCancel, onConfirm, testid }) {
  const [pin, setPin] = useState("");
  const ok = /^\d{4,8}$/.test(pin);
  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid={`${testid}-pin-modal`}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-2xl">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-500" /> {title}</p>
        <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
        <input autoFocus data-testid={`${testid}-pin-input`} type="password" autoComplete="one-time-code" inputMode="numeric" maxLength={8} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && ok && onConfirm(pin)}
          style={{ background: "#fff", color: "#0f172a", WebkitTextFillColor: "#0f172a", colorScheme: "light" }}
          className="mt-3 w-full px-3 py-2 rounded-lg border border-slate-200 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-amber-200" />
        <div className="flex gap-2 mt-3">
          <button data-testid={`${testid}-pin-cancel`} onClick={onCancel} className="flex-1 py-2 rounded-lg text-xs text-slate-500 border border-slate-200">Cancel</button>
          <button data-testid={`${testid}-pin-confirm`} disabled={!ok || busy} onClick={() => onConfirm(pin)}
            className={`flex-1 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${danger ? "bg-rose-600" : "bg-slate-900"}`}>
            {busy ? "Checking…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const longDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening"; };
const greetIcon = () => (new Date().getHours() < 17 ? "☀️" : "🌙");

export function BriefingCard({ name, date, yesterday, briefing, inr }) {
  return (
    <section data-testid="owner-briefing" className="relative rounded-3xl border border-orange-100 bg-[linear-gradient(135deg,#fff7ed_0%,#fffaf3_55%,#f4f7ff_100%)] p-5 sm:p-6 shadow-[0_8px_30px_rgba(15,30,51,.06)]">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-lg shrink-0">{greetIcon()}</div>
        <div className="min-w-0 flex-1">
          <h2 className="font-playfair text-2xl sm:text-3xl text-slate-900 leading-tight">{greet()}, {name} <span className="text-amber-500">✦</span></h2>
          <p className="text-sm text-slate-500 mt-1">{longDate(date)} · {briefing.appointments_today} appointments today — Mira's daily briefing</p>
          <p className="mt-3 text-base text-slate-800" data-testid="owner-briefing-yesterday">💰 Yesterday's revenue: <span className="font-bold text-emerald-600">{inr(yesterday.total)}</span> — great work!</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">✅ {briefing.checked_in} checked in</span>
            <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">⏳ {briefing.not_in} not in yet</span>
          </div>
          <p className="mt-3 text-sm text-slate-700 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-slate-500" /> {briefing.appointments_yesterday} appointments yesterday · {yesterday.total_bills} bills</p>
          <p className="mt-2 text-sm text-emerald-700">✅ Inventory looks healthy — no product is below its reorder level.</p>
        </div>
      </div>
    </section>
  );
}

const TILES = [
  { key: "rev", label: "Total Revenue", icon: IndianRupee, cls: "from-[#3b82f6] to-[#2563eb]" },
  { key: "bills", label: "Total Bills", icon: Receipt, cls: "from-[#22c1c3] to-[#0ea5b7]" },
  { key: "days", label: "Days Included", icon: CalendarDays, cls: "from-[#8b5cf6] to-[#6d28d9]" },
  { key: "avg", label: "Avg. Bill Value", icon: BarChart3, cls: "from-[#fb923c] to-[#f97316]" },
];

export function SnapshotHero({ name, period, bookingUrl, inr, periods, cur, onPick }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(bookingUrl); toast.success("Booking link copied!"); } catch { toast.error("Couldn't copy"); }
  };
  const days = period.days.length;
  const sub = period.range.from === period.range.to ? fmtD(period.range.from) : `${fmtD(period.range.from)} – ${fmtD(period.range.to)}`;
  const vals = { rev: inr(period.total), bills: period.total_bills, days, avg: inr(period.avg_bill) };
  const subs = { rev: sub, bills: sub, days: days === 1 ? fmtDow(period.range.from) : `${fmtDow(period.range.from)} → ${fmtDow(period.range.to)}`, avg: "(Approx.)" };
  return (
    <section data-testid="owner-snapshot-hero" className="relative overflow-hidden rounded-3xl p-5 sm:p-7 text-white shadow-[0_30px_60px_-30px_rgba(37,99,235,.7)] bg-[linear-gradient(135deg,#2563eb_0%,#1d4ed8_45%,#0ea5e9_100%)]">
      <div className="pointer-events-none absolute -right-20 -top-24 w-72 h-72 rounded-full bg-white/15 blur-3xl" />
      <div className="relative">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/70 font-semibold">Today's Snapshot</div>
        <h1 className="font-outfit text-3xl sm:text-4xl font-bold leading-tight mt-2">Welcome back to<br />{name} <span className="text-white/90">✦</span></h1>
        <div className="mt-4 flex flex-wrap gap-2" data-testid="owner-period-chips">
          {periods.map(x => (
            <button key={x.key} data-testid={`owner-period-${x.key}`} onClick={() => onPick(x.key)}
              className={`text-xs px-3.5 py-1.5 rounded-full border transition-colors ${cur === x.key ? "bg-white text-blue-700 border-white font-semibold" : "bg-white/10 border-white/30 text-white/85 hover:bg-white/20"}`}>{x.label}</button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="owner-tiles">
          {TILES.map(t => (
            <div key={t.key} data-testid={`owner-tile-${t.key}`} className={`rounded-2xl bg-gradient-to-br ${t.cls} p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,.35)]`}>
              <t.icon className="w-5 h-5 text-white/90" />
              <div className="text-xs text-white/85 mt-2">{t.label}</div>
              <div className="font-outfit text-2xl sm:text-3xl font-bold leading-tight mt-0.5 truncate">{vals[t.key]}</div>
              <div className="text-[11px] text-white/75 mt-0.5 truncate">{subs[t.key]}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-white/85 mt-4 max-w-2xl">A polished glance at appointments, revenue and inventory — everything you need at a glance.</p>
        <div className="mt-4 rounded-2xl bg-white/12 border border-white/25 p-4 backdrop-blur-md" data-testid="owner-snapshot-link">
          <div className="text-[10px] uppercase tracking-[0.26em] text-white/80 font-semibold flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" /> Public Booking Link</div>
          <p className="text-xs text-white/75 mt-1.5">Share on Instagram, WhatsApp & Google profile — customers can self-book 24/7.</p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 rounded-lg bg-white text-slate-700 text-xs font-mono px-3 py-2.5 truncate">{bookingUrl}</div>
            <button onClick={copy} data-testid="owner-snapshot-copy" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 px-4 py-2.5 text-xs font-semibold transition-colors"><Copy className="w-3.5 h-3.5" /> Copy Link</button>
            <a href={bookingUrl} target="_blank" rel="noreferrer" data-testid="owner-snapshot-open" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-900/80 px-4 py-2.5 text-xs font-semibold transition-colors"><ExternalLink className="w-3.5 h-3.5" /> Open</a>
          </div>
        </div>
      </div>
    </section>
  );
}

const fmtD = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fmtDow = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
const fmtDowLong = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" });

export function RevenueBreakdown({ period, inr }) {
  const days = [...period.days].reverse();
  return (
    <section data-testid="owner-breakdown" className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-[0_8px_30px_rgba(15,30,51,.06)]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-semibold">Revenue Breakdown · {period.label}</div>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-4">
        <div className={`grid gap-3 ${days.length > 2 ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" : "grid-cols-2"}`} data-testid="owner-breakdown-days">
          {days.map(d => (
            <div key={d.date} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
              <div className="text-sm font-semibold text-slate-800">{fmtDowLong(d.date)}, {d.date.slice(8).replace(/^0/, "")}</div>
              <div className="text-[11px] text-slate-500">Revenue</div>
              <div className={`font-outfit text-2xl font-bold ${d.revenue ? "text-blue-600" : "text-slate-400"}`}>{inr(d.revenue)}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-5 py-4 flex flex-col justify-center" data-testid="owner-breakdown-total">
          <div className="text-sm font-semibold text-slate-800">Total Revenue</div>
          <div className="font-outfit text-3xl font-bold text-emerald-600 mt-1">{inr(period.total)}</div>
          <div className="text-sm text-slate-600 mt-1">Total Bills: <b>{period.total_bills}</b></div>
        </div>
      </div>
    </section>
  );
}

const PAY = [
  { k: "total_upi", label: "UPI", icon: Smartphone, cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  { k: "total_card", label: "Card", icon: CreditCard, cls: "bg-sky-50 text-sky-700 border-sky-100" },
  { k: "total_cash", label: "Cash", icon: Wallet, cls: "bg-amber-50 text-amber-700 border-amber-100" },
];
const TEAM_CLS = ["bg-rose-50 text-rose-700 border-rose-100", "bg-violet-50 text-violet-700 border-violet-100", "bg-sky-50 text-sky-700 border-sky-100", "bg-emerald-50 text-emerald-700 border-emerald-100"];
const BAR_CLS = ["bg-rose-400", "bg-violet-400", "bg-sky-400", "bg-emerald-400"];

export function TeamAndPayments({ period, inr }) {
  const max = period.stylists[0]?.revenue || 1;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section data-testid="owner-team" className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-[0_8px_30px_rgba(15,30,51,.06)]">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-semibold">Business by Stylist · {period.label}</div>
          {period.top_stylist && <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100"><Crown className="w-3.5 h-3.5" /> Top: {period.top_stylist.name}</span>}
        </div>
        {period.stylists.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No billing recorded for this period yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {period.stylists.map((s, i) => (
              <li key={s.name} data-testid={`owner-stylist-${s.name.toLowerCase()}`} className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold ${TEAM_CLS[i % 4]}`}>{s.name[0]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-800">{s.name}</span><span className="font-outfit font-bold text-slate-900">{inr(s.revenue)}</span></div>
                  <div className="h-2 rounded-full bg-slate-100 mt-1.5 overflow-hidden"><div className={`h-full rounded-full ${BAR_CLS[i % 4]} transition-[width] duration-700`} style={{ width: `${Math.max(4, (s.revenue / max) * 100)}%` }} /></div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{s.services} services</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section data-testid="owner-payments" className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-[0_8px_30px_rgba(15,30,51,.06)]">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-semibold">Payments · {period.label}</div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {PAY.map(p => (
            <div key={p.k} data-testid={`owner-pay-${p.label.toLowerCase()}`} className={`rounded-2xl border px-3 py-3 ${p.cls}`}>
              <p.icon className="w-4 h-4" />
              <div className="text-xs mt-2 opacity-80">{p.label}</div>
              <div className="font-outfit text-lg sm:text-xl font-bold leading-tight truncate">{inr(period[p.k])}</div>
              <div className="text-[11px] opacity-70">{period.total ? Math.round((period[p.k] / period.total) * 100) : 0}%</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3"><div className="text-[11px] text-slate-500">Total Bookings</div><div className="font-outfit text-xl font-bold text-slate-900">{period.total_bookings}</div></div>
          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3"><div className="text-[11px] text-slate-500">Total Bills</div><div className="font-outfit text-xl font-bold text-slate-900">{period.total_bills}</div></div>
        </div>
      </section>
    </div>
  );
}

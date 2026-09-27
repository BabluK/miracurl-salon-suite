import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, Lock, KeyRound, EyeOff, Loader2, Coins } from "lucide-react";
import { GroupKpis, BranchCard, PeriodPicker, PERIODS } from "@/components/dashboard/GroupDashboardBits";

// Collection Review — owners (1 branch or many) track cash/UPI/card, bookings, bills & top stylist per period.
// PIN-locked: unlocks with the Owner PIN and re-locks on refresh/navigation.
const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const todayIso = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const CREAM = "relative overflow-hidden rounded-3xl border border-[#f1dfc4] text-slate-800 shadow-[0_24px_50px_-30px_rgba(180,130,60,.45)] bg-[linear-gradient(135deg,#fffaf3_0%,#fdf1e2_45%,#fbe6dd_100%)]";

export default function MySalonsOverview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("today");
  const [range, setRange] = useState({ from: todayIso(), to: todayIso() });
  const [pinCache, setPinCache] = useState("");

  const count = (user?.salons || []).length || 1;
  const multi = count > 1;
  const isOwner = user?.role === "admin" || user?.role === "super_admin";
  if (!isOwner) return null;
  const title = multi ? "Group Dashboard" : "Collection Review";

  async function unlock(pinValue, p = period, r = range) {
    setBusy(true);
    try {
      const usePin = pinValue || pinCache;
      const qs = p === "custom" ? `period=custom&date_from=${r.from}&date_to=${r.to}` : `period=${p}`;
      const { data: d } = await api.get(`/auth/my-salons/overview?${qs}`, usePin ? { headers: { "X-Owner-Pin": usePin } } : {});
      if (usePin) setPinCache(usePin);
      setData(d);
      setPeriod(p);
      setRange(r);
      setPinOpen(false);
      setPin("");
      if (!data) toast.success(`${title} unlocked ✦`);
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail === "OWNER_PIN_REQUIRED") setPinOpen(true);
      else toast.error(typeof detail === "string" ? detail : `Couldn't unlock ${title}`);
    } finally { setBusy(false); }
  }

  if (!data) {
    return (
      <>
        <div className={`${CREAM} p-5 sm:p-6`} data-testid="group-dashboard-locked">
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[#f3c98b]/30 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#b8862b] font-semibold flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> {title}
              </div>
              <p className="font-playfair text-2xl mt-1 text-slate-900">{multi ? `All ${count} salons, one glance` : "Your salon, any period — one glance"}</p>
              <p className="text-sm text-slate-600 mt-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#b8862b]" /> {multi ? "Combined collections, cash, bookings & top stylist per branch" : "Cash · UPI · card, bookings, bills & top stylist — daily, weekly or monthly"} — Owner PIN required.
              </p>
            </div>
            <button data-testid="group-dashboard-unlock-btn" disabled={busy} onClick={() => unlock()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-sm font-bold hover:brightness-110 disabled:opacity-60 shrink-0 transition-[filter]">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {busy ? "Unlocking…" : `Unlock ${title}`}
            </button>
          </div>
        </div>

        {pinOpen && (
          <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" data-testid="group-dashboard-pin-modal">
            <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-2xl">
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" /> Owner PIN required
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Enter your Owner Security PIN to view the {title}.</p>
              <input autoFocus data-testid="group-dashboard-pin-input" type="password" autoComplete="one-time-code" name="owner-pin" inputMode="numeric" maxLength={6} value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === "Enter" && pin && unlock(pin)}
                className="mt-3 w-full px-3 py-2 rounded-lg border border-slate-200 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-amber-200" />
              <div className="flex gap-2 mt-3">
                <button data-testid="group-dashboard-pin-cancel" onClick={() => { setPinOpen(false); setPin(""); }}
                  className="flex-1 py-2 rounded-lg text-xs text-slate-500 border border-slate-200">Cancel</button>
                <button data-testid="group-dashboard-pin-confirm" disabled={!pin || busy} onClick={() => unlock(pin)}
                  className="flex-1 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50">
                  {busy ? "Checking…" : "Unlock"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const cur = data.period || "today";
  const label = PERIODS.find(x => x.key === cur)?.label || (cur === "custom" ? "Custom range" : /^\d{4}-\d{2}$/.test(cur) ? "Month" : cur);

  return (
    <section className={CREAM} data-testid="my-salons-overview">
      <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-[#f3c98b]/35 blur-3xl pointer-events-none" />
      <div className="absolute -left-16 bottom-0 w-64 h-64 rounded-full bg-[#f9d5db]/50 blur-3xl pointer-events-none" />
      <div className="relative p-4 sm:p-6 lg:p-7">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#b8862b] font-semibold flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" /> {title} · {label}
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-playfair text-4xl sm:text-5xl leading-none text-slate-900" data-testid="my-salons-total-today">{inr(data.total_today)}</span>
              <span className="text-sm text-slate-500" data-testid="my-salons-period-label">{multi ? "combined collection" : "collection"} · {data.period_label || data.date}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
            <span className="hidden xl:block font-playfair italic text-[#c99a2e] text-xl leading-tight text-right rotate-[-4deg] mr-2 select-none">More Beauty<br />More Confidence</span>
            <div className="flex items-center gap-3 rounded-2xl border border-[#eadbc3] bg-white/70 px-4 py-2.5" data-testid="my-salons-month-pill">
              <span className="w-9 h-9 rounded-xl bg-[#fbeed2] text-[#b8862b] flex items-center justify-center"><Coins className="w-5 h-5" strokeWidth={1.7} /></span>
              <span className="text-xs text-slate-500 leading-tight">This month<br /><span className="font-playfair text-xl text-slate-900" data-testid="my-salons-total-month">{inr(data.total_month)}</span></span>
            </div>
            <button data-testid="group-dashboard-lock-btn" onClick={() => { setData(null); setPinCache(""); }} title={`Lock ${title}`}
              className="p-2.5 rounded-full bg-white/70 border border-[#eadbc3] text-slate-500 hover:text-slate-800 hover:bg-white transition-colors">
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
        </div>

        <PeriodPicker cur={cur} range={range} busy={busy} onPick={(p) => unlock(null, p)} onRange={(r) => unlock(null, "custom", r)} />

        <GroupKpis data={data} inr={inr} />

        <div className={`mt-5 grid grid-cols-1 gap-4 ${multi ? "md:grid-cols-2 xl:grid-cols-3" : "md:max-w-xl"}`}>
          {data.salons.map((s, i) => <BranchCard key={s.id} s={s} rank={i} showAvg={cur !== "today"} inr={inr} leader={multi} />)}
        </div>
      </div>
    </section>
  );
}

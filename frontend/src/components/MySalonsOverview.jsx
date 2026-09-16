import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, Lock, KeyRound, EyeOff, Loader2, Coins } from "lucide-react";
import { GroupKpis, BranchCard, PeriodPicker, PERIODS } from "@/components/dashboard/GroupDashboardBits";

// Group Dashboard — multi-salon owners see combined collections across all branches.
// PIN-locked: unlocks with the Owner PIN and re-locks on refresh/navigation.
const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const todayIso = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export default function MySalonsOverview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("today");
  const [range, setRange] = useState({ from: todayIso(), to: todayIso() });
  const [pinCache, setPinCache] = useState("");

  const multi = (user?.salons || []).length > 1;
  const isOwner = user?.role === "admin" || user?.role === "super_admin";
  if (!multi || !isOwner) return null;

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
      if (!data) toast.success("Group Dashboard unlocked ✦");
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail === "OWNER_PIN_REQUIRED") setPinOpen(true);
      else toast.error(typeof detail === "string" ? detail : "Couldn't unlock Group Dashboard");
    } finally { setBusy(false); }
  }

  if (!data) {
    return (
      <>
        <div className="relative overflow-hidden rounded-3xl bg-[#14100c] text-white p-6 shadow-[0_30px_60px_-30px_rgba(0,0,0,.6)]" data-testid="group-dashboard-locked">
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[#e8c56a]/15 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#e8c56a] font-semibold flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> Group Dashboard
              </div>
              <p className="font-playfair text-2xl mt-1">All {user.salons.length} salons, one glance</p>
              <p className="text-sm text-white/60 mt-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#e8c56a]" /> Combined collections, cash, bookings & top stylist per branch — Owner PIN required.
              </p>
            </div>
            <button data-testid="group-dashboard-unlock-btn" disabled={busy} onClick={() => unlock()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-sm font-bold hover:brightness-110 disabled:opacity-60 shrink-0 transition-[filter]">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {busy ? "Unlocking…" : "Unlock Group Dashboard"}
            </button>
          </div>
        </div>

        {pinOpen && (
          <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" data-testid="group-dashboard-pin-modal">
            <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-2xl">
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" /> Owner PIN required
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Enter your Owner Security PIN to view the Group Dashboard.</p>
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
    <section className="relative overflow-hidden rounded-3xl bg-[#14100c] text-white shadow-[0_30px_60px_-30px_rgba(0,0,0,.6)]" data-testid="my-salons-overview">
      <img src="/assets/dashboard/hero-salon.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-right opacity-35 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a08] via-[#0b0a08]/92 to-[#0b0a08]/55 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a08] via-transparent to-transparent pointer-events-none" />
      <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-[#e8c56a]/10 blur-3xl pointer-events-none" />
      <div className="relative p-6 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#e8c56a] font-semibold flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" /> Group Dashboard · {label}
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-playfair text-4xl sm:text-5xl leading-none" data-testid="my-salons-total-today">{inr(data.total_today)}</span>
              <span className="text-sm text-white/60" data-testid="my-salons-period-label">combined collection · {data.period_label || data.date}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden xl:block font-playfair italic text-[#e8c56a] text-xl leading-tight text-right rotate-[-4deg] mr-2 select-none">More Beauty<br />More Confidence</span>
            <div className="flex items-center gap-3 rounded-2xl border border-[#e8c56a]/35 bg-black/30 px-4 py-2.5" data-testid="my-salons-month-pill">
              <span className="w-9 h-9 rounded-xl bg-[#e8c56a]/15 text-[#e8c56a] flex items-center justify-center"><Coins className="w-5 h-5" strokeWidth={1.7} /></span>
              <span className="text-xs text-white/55 leading-tight">This month<br /><span className="font-playfair text-xl text-white" data-testid="my-salons-total-month">{inr(data.total_month)}</span></span>
            </div>
            <button data-testid="group-dashboard-lock-btn" onClick={() => { setData(null); setPinCache(""); }} title="Lock Group Dashboard"
              className="p-2.5 rounded-full bg-white/10 border border-white/15 text-white/70 hover:text-white hover:bg-white/20 transition-colors">
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
        </div>

        <PeriodPicker cur={cur} range={range} busy={busy} onPick={(p) => unlock(null, p)} onRange={(r) => unlock(null, "custom", r)} />

        <GroupKpis data={data} inr={inr} />

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.salons.map((s, i) => <BranchCard key={s.id} s={s} rank={i} showAvg={cur !== "today"} inr={inr} />)}
        </div>
      </div>
    </section>
  );
}

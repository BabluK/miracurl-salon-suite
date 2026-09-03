import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, IndianRupee, Receipt, Lock, KeyRound, EyeOff, Loader2 } from "lucide-react";

const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// Group Dashboard — multi-salon owners see combined collections across all branches.
// PIN-locked: unlocks with the Owner PIN and re-locks on refresh/navigation.
const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
];

export default function MySalonsOverview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("today");
  const [pinCache, setPinCache] = useState("");

  const multi = (user?.salons || []).length > 1;
  const isOwner = user?.role === "admin" || user?.role === "super_admin";
  if (!multi || !isOwner) return null;

  async function unlock(pinValue, p = period) {
    setBusy(true);
    try {
      const usePin = pinValue || pinCache;
      const { data: d } = await api.get(`/auth/my-salons/overview?period=${p}`,
        usePin ? { headers: { "X-Owner-Pin": usePin } } : {});
      if (usePin) setPinCache(usePin);
      setData(d);
      setPeriod(p);
      setPinOpen(false);
      setPin("");
      toast.success("Group Dashboard unlocked ✦");
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail === "OWNER_PIN_REQUIRED") setPinOpen(true);
      else toast.error(typeof detail === "string" ? detail : "Couldn't unlock Group Dashboard");
    } finally { setBusy(false); }
  }

  if (!data) {
    return (
      <>
        <div className="bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden" data-testid="group-dashboard-locked">
          <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-fuchsia-500/20 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-300 font-semibold flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> Group Dashboard
              </div>
              <p className="text-sm text-white/70 mt-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                Combined collections across all {user.salons.length} of your salons — Owner PIN required.
              </p>
            </div>
            <button data-testid="group-dashboard-unlock-btn" disabled={busy} onClick={() => unlock()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white text-sm font-semibold hover:from-fuchsia-600 hover:to-pink-700 disabled:opacity-60 shrink-0">
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

  return (
    <div className="bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden" data-testid="my-salons-overview">
      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-fuchsia-500/20 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-300 font-semibold flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" /> Group Dashboard · {PERIODS.find(x => x.key === (data.period || "today"))?.label || data.period_label}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold" data-testid="my-salons-total-today">{inr(data.total_today)}</span>
            <span className="text-xs text-white/60" data-testid="my-salons-period-label">combined collection · {data.period_label || data.date}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="group-period-chips">
            <label className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
              /^\d{4}-\d{2}$/.test(data.period || "") ? "bg-fuchsia-500/30 border-fuchsia-400/60 text-white" : "bg-white/5 border-white/15 text-white/60 hover:text-white hover:border-white/40"}`}
              title="Pick any month">
              <span>Select month</span>
              <input data-testid="group-period-custom-month" type="month" max={new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7)}
                value={/^\d{4}-\d{2}$/.test(data.period || "") ? data.period : ""}
                onChange={e => e.target.value && unlock(null, e.target.value)} disabled={busy}
                className="bg-transparent text-[11px] text-white/80 outline-none w-[7.5rem] [color-scheme:dark]" />
            </label>
            {PERIODS.map(p => (
              <button key={p.key} data-testid={`group-period-${p.key}`} disabled={busy} onClick={() => unlock(null, p.key)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  (data.period || "today") === p.key ? "bg-fuchsia-500/30 border-fuchsia-400/60 text-white" : "bg-white/5 border-white/15 text-white/60 hover:text-white hover:border-white/40"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-white/60">
            This month: <span className="text-white font-semibold" data-testid="my-salons-total-month">{inr(data.total_month)}</span>
          </div>
          <button data-testid="group-dashboard-lock-btn" onClick={() => { setData(null); setPinCache(""); }}
            title="Lock Group Dashboard"
            className="p-2 rounded-lg bg-white/10 border border-white/20 text-white/70 hover:text-white hover:bg-white/20">
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.salons.map(s => (
          <div key={s.id} data-testid={`my-salon-card-${s.slug}`}
            className={`rounded-xl p-3.5 border ${s.active ? "bg-white/10 border-fuchsia-400/50" : "bg-white/5 border-white/10"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate">{s.name}</p>
              {s.active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400/40 uppercase tracking-wider shrink-0">Active</span>}
            </div>
            <p className="text-[10px] text-white/50 truncate">{s.location || s.slug}</p>
            <div className="mt-2.5 flex items-center gap-1.5">
              <IndianRupee className="w-4 h-4 text-emerald-300" />
              <span className="text-xl font-bold" data-testid={`my-salon-today-${s.slug}`}>{inr(s.today)}</span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-white/60">
              <span className="inline-flex items-center gap-1"><Receipt className="w-3 h-3" /> {s.invoices_today} bill{s.invoices_today === 1 ? "" : "s"}</span>
              <span>{s.appointments_today} appt{s.appointments_today === 1 ? "" : "s"}</span>
              {(data.period || "today") !== "today" && s.invoices_today > 0 && <span className="text-white/40">avg {inr(Math.round(s.today / s.invoices_today))}/bill</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

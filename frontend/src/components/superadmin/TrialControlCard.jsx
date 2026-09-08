import { useState } from "react";
import { CalendarClock, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const PICKS = [[{ days: 30 }, "30 days"], [{ months: 3 }, "3 months"], [{ months: 6 }, "6 months"], [{ months: 9 }, "9 months"], [{ months: 12 }, "1 year"]];
const fmt = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const daysLeft = (v) => (v ? Math.ceil((new Date(v) - Date.now()) / 86400000) : null);

export function TrialControlCard({ tenant, onChanged }) {
  const [end, setEnd] = useState(tenant.trial_end_date || tenant.trial_ends_at || "");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(null);
  const paid = !!tenant.subscription_end_date;
  const left = daysLeft(end);
  const apply = async (body, key) => {
    setBusy(key);
    try {
      const { data } = await api.post(`/super-admin/tenants/${tenant.id}/trial`, body);
      setEnd(data.trial_end_date);
      toast.success(`Free trial set to ${data.label} — ends ${fmt(data.trial_end_date)} (${data.days_left} days left)`);
      onChanged?.(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update the trial"); }
    finally { setBusy(null); }
  };
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4" data-testid="trial-control-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Gift className="w-4 h-4 text-amber-600" /> Free trial</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Extend or reset the complimentary access. Counted from today; the owner keeps every feature until the end date.</p>
        </div>
        <div className="text-right" data-testid="trial-current">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Trial ends</div>
          <div className="text-sm font-bold text-slate-800 inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-amber-600" /> {fmt(end)}</div>
          {left !== null && <div className={`text-[11px] font-semibold ${left <= 7 ? "text-rose-600" : left <= 30 ? "text-amber-600" : "text-emerald-600"}`}>{left > 0 ? `${left} days left` : "expired"}</div>}
        </div>
      </div>
      {paid && <p className="mt-2 text-[11px] text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">This tenant is on a paid plan until {fmt(tenant.subscription_end_date)} — the trial dates are kept for records only. Use “Change plan” below to extend paid access.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PICKS.map(([body, label]) => {
          const key = JSON.stringify(body);
          return (
            <button key={key} type="button" onClick={() => apply(body, key)} disabled={!!busy} data-testid={`trial-pick-${body.months || body.days}`}
              className="px-3 py-1.5 rounded-full border border-amber-300 bg-white text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 inline-flex items-center gap-1">
              {busy === key ? <Loader2 className="w-3 h-3 animate-spin" /> : null}{label}
            </button>
          );
        })}
        <span className="text-slate-300 mx-1">|</span>
        <input type="date" value={custom} onChange={e => setCustom(e.target.value)} data-testid="trial-custom-date" className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
        <button type="button" disabled={!custom || !!busy} onClick={() => apply({ end_date: custom }, "custom")} data-testid="trial-custom-apply"
          className="px-3 py-1.5 rounded-full bg-slate-900 text-[#F0D9A5] text-xs font-semibold disabled:opacity-40">Set exact date</button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { CalendarClock, BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const fmt = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const daysLeft = (v) => (v ? Math.ceil((new Date(v) - Date.now()) / 86400000) : null);

// Shown instead of the free-trial card once a tenant pays: goodwill +1 / +2 month extensions on request.
export function PaidPlanCard({ tenant, onChanged }) {
  const [end, setEnd] = useState(tenant.subscription_end_date);
  const [busy, setBusy] = useState(null);
  const [notify, setNotify] = useState(true);
  const left = daysLeft(end);
  const extend = async (months) => {
    if (!window.confirm(`Extend ${tenant.name}'s paid plan by ${months} month${months > 1 ? "s" : ""} free of charge?`)) return;
    setBusy(months);
    try {
      const { data } = await api.post(`/super-admin/tenants/${tenant.id}/extend-plan`, { months, notify });
      setEnd(data.subscription_end_date);
      const mail = data.email?.sent ? ` · owner emailed at ${data.email.to}` : notify && data.email?.error ? ` · ⚠ email not sent (${data.email.error})` : "";
      toast.success(`Paid plan extended by ${data.label} — now valid till ${fmt(data.subscription_end_date)}${mail}`, { duration: 7000 });
      onChanged?.(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't extend the plan"); }
    finally { setBusy(null); }
  };
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4" data-testid="paid-plan-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><BadgeCheck className="w-4 h-4 text-emerald-600" /> Paid plan · {String(tenant.plan || "").replace(/_/g, " ").toUpperCase()}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">This salon has paid — no free trial applies. Add a goodwill extension when the owner asks for one.</p>
        </div>
        <div className="text-right" data-testid="paid-plan-current">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Valid till</div>
          <div className="text-sm font-bold text-slate-800 inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-emerald-600" /> {fmt(end)}</div>
          {left !== null && <div className={`text-[11px] font-semibold ${left <= 7 ? "text-rose-600" : left <= 30 ? "text-amber-600" : "text-emerald-600"}`}>{left > 0 ? `${left} days left` : "expired"}</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {[1, 2].map(m => (
          <button key={m} type="button" onClick={() => extend(m)} disabled={!!busy} data-testid={`plan-extend-${m}`}
            className="px-3 py-1.5 rounded-full border border-emerald-300 bg-white text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 inline-flex items-center gap-1">
            {busy === m ? <Loader2 className="w-3 h-3 animate-spin" /> : null}+{m} month{m > 1 ? "s" : ""} free
          </button>
        ))}
        <span className="text-[11px] text-slate-500 ml-1">Adds on top of the current end date.</span>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer" data-testid="plan-extend-notify">
        <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="accent-emerald-600 w-3.5 h-3.5" />
        Email the owner the new end date {tenant.owner_email ? <span className="text-slate-400">({tenant.owner_email})</span> : <span className="text-rose-500">— no owner email on file</span>}
      </label>
    </div>
  );
}

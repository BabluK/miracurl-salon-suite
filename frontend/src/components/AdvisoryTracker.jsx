import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Target, Loader2, Flag } from "lucide-react";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const lakh = (n) => (n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L` : fmt(n));

export function AdvisoryTracker({ booking, progress: p, dark = true, editable = false, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ target_monthly: p?.target_monthly || 300000, start_date: p?.start_date || "" });
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const tx = dark ? "text-slate-100" : "text-slate-800", sub = dark ? "text-slate-400" : "text-slate-500";
  const panel = dark ? "bg-white/[.04] border-white/10" : "bg-amber-50/40 border-amber-100";
  const max = Math.max(p.target_monthly, ...p.months.map(m => m.revenue), 1);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/super-admin/growth-advisory/bookings/${booking.id}/tracker`, { ...f, target_monthly: Number(f.target_monthly) });
      toast.success("Tracker updated"); setEdit(false); onSaved?.(data.progress);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    setBusy(false);
  };
  return (
    <div className={`rounded-2xl border p-4 mt-3 ${panel}`} data-testid={`advisory-tracker-${booking.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[2px] text-[#d4af37] flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> 90-day growth tracker</div>
          <div className={`text-xs mt-0.5 ${sub}`}>Day <b className={tx}>{p.day}</b> of 90 · <b className={tx} data-testid={`advisory-days-left-${booking.id}`}>{p.days_left}</b> days left · started {new Date(p.start_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
        </div>
        <div className="text-right">
          <div className={`text-[10px] uppercase tracking-wider ${sub}`}>Monthly target</div>
          <div className="font-playfair text-xl text-[#F0D9A5]" data-testid={`advisory-target-${booking.id}`}>{lakh(p.target_monthly)}</div>
          {editable && <button onClick={() => setEdit(v => !v)} className="text-[10px] text-[#d4af37] hover:underline" data-testid={`advisory-tracker-edit-${booking.id}`}>{edit ? "cancel" : "set target & start"}</button>}
        </div>
      </div>
      {edit && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mt-3">
          <label className={`text-[10px] uppercase ${sub}`}>Target / month (₹)<input type="number" step={10000} value={f.target_monthly} onChange={e => setF({ ...f, target_monthly: e.target.value })} className="mt-1 w-full border border-white/10 rounded-lg px-2.5 py-1.5 text-xs !bg-white/5 !text-slate-200" data-testid={`advisory-tracker-target-input-${booking.id}`} /></label>
          <label className={`text-[10px] uppercase ${sub}`}>Start date<input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} className="mt-1 w-full border border-white/10 rounded-lg px-2.5 py-1.5 text-xs !bg-white/5 !text-slate-200" data-testid={`advisory-tracker-start-input-${booking.id}`} /></label>
          <button onClick={save} disabled={busy} className="h-8 px-4 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold disabled:opacity-50" data-testid={`advisory-tracker-save-${booking.id}`}>{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}</button>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className={sub}>This month so far</span>
          <span className={`font-semibold ${tx}`} data-testid={`advisory-current-${booking.id}`}>{fmt(p.current_month_revenue)} <span className="text-[#d4af37]">· {p.pct_to_target}%</span></span>
        </div>
        <div className={`mt-1.5 h-3 rounded-full overflow-hidden ${dark ? "bg-white/10" : "bg-slate-200"}`}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#C89B52] via-[#F0D9A5] to-emerald-400 transition-[width] duration-700" style={{ width: `${p.pct_to_target}%` }} data-testid={`advisory-progress-bar-${booking.id}`} />
        </div>
        {p.baseline_monthly > 0 && <div className={`text-[10px] mt-1 ${sub}`}>Before the programme you averaged {fmt(p.baseline_monthly)}/month</div>}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 items-end h-24" data-testid={`advisory-trend-${booking.id}`}>
        {p.months.map(m => (
          <div key={m.month} className="flex flex-col items-center justify-end h-full gap-1">
            <div className={`text-[10px] ${m.current ? "text-[#F0D9A5] font-semibold" : sub}`}>{lakh(m.revenue)}</div>
            <div className={`w-full rounded-t-lg ${m.current ? "bg-gradient-to-t from-[#C89B52] to-[#F0D9A5]" : dark ? "bg-white/15" : "bg-slate-300"}`} style={{ height: `${Math.max(6, (m.revenue / max) * 60)}px` }} />
            <div className={`text-[10px] uppercase ${sub}`}>{m.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {p.milestones.map(m => (
          <div key={m.day} className={`rounded-xl px-2.5 py-2 border ${m.reached ? (m.hit_target ? "border-emerald-400/50 bg-emerald-500/10" : "border-[#d4af37]/40 bg-[#d4af37]/10") : dark ? "border-white/10 bg-white/[.03]" : "border-slate-200 bg-white"}`} data-testid={`advisory-milestone-${booking.id}-${m.day}`}>
            <div className={`text-[10px] uppercase tracking-wide flex items-center gap-1 ${sub}`}><Flag className="w-3 h-3" /> Day {m.day}</div>
            <div className={`text-xs font-semibold mt-0.5 ${tx}`}>{m.reached ? fmt(m.revenue) : new Date(m.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
            <div className={`text-[10px] ${m.reached ? (m.hit_target ? "text-emerald-400" : "text-[#d4af37]") : sub}`}>{m.reached ? (m.hit_target ? "Target hit ✦" : "Check-in done") : "Upcoming check-in"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

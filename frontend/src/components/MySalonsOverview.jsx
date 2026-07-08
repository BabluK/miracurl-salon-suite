import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Store, IndianRupee, Receipt } from "lucide-react";

const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// Multi-salon owners: today's collection per branch + combined total.
export default function MySalonsOverview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const multi = (user?.salons || []).length > 1;

  useEffect(() => {
    if (!multi) return;
    api.get("/auth/my-salons/overview").then(r => setData(r.data)).catch(() => {});
  }, [multi]);

  if (!multi || !data) return null;

  return (
    <div className="bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden" data-testid="my-salons-overview">
      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-fuchsia-500/20 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-300 font-semibold flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" /> All My Salons · Today
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold" data-testid="my-salons-total-today">{inr(data.total_today)}</span>
            <span className="text-xs text-white/60">combined collection · {data.date}</span>
          </div>
        </div>
        <div className="text-right text-xs text-white/60">
          This month: <span className="text-white font-semibold" data-testid="my-salons-total-month">{inr(data.total_month)}</span>
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Download, ChevronLeft, ChevronRight, PieChart, Users, CalendarDays } from "lucide-react";

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString("en-IN")}`;
const CAT_LABEL = { tea: "☕ Tea / snacks", salon: "✂️ Salon supplies", cleaning: "🧹 Cleaning", travel: "🛵 Travel", repair: "🔧 Repair", other: "📦 Other" };
const BAR = { tea: "bg-amber-400", salon: "bg-fuchsia-400", cleaning: "bg-sky-400", travel: "bg-emerald-400", repair: "bg-orange-400", other: "bg-slate-400" };
const thisMonth = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
const shiftMonth = (m, n) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const label = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export const CashMonthlyReport = () => {
  const [month, setMonth] = useState(thisMonth());
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setD(null);
    api.get(`/cash/month?month=${month}`).then(r => setD(r.data)).catch(() => toast.error("Couldn't load the monthly report"));
  }, [month]);

  async function download() {
    setBusy(true);
    try {
      const res = await api.get(`/cash/month/export?month=${month}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `cash-register-${month}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`cash-register-${month}.csv downloaded — opens in Excel / Google Sheets`);
    } catch { toast.error("Download failed"); }
    finally { setBusy(false); }
  }

  const maxCat = d ? Math.max(1, ...d.by_category.map(c => c.amount)) : 1;

  return (
    <div className="space-y-5" data-testid="cash-monthly-report">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button data-testid="cash-month-prev" onClick={() => setMonth(shiftMonth(month, -1))} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-semibold text-slate-800 min-w-[170px] text-center" data-testid="cash-month-label">{label(month)}</span>
          <button data-testid="cash-month-next" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <button data-testid="cash-month-download" onClick={download} disabled={busy || !d} className="btn-blue flex items-center gap-2 disabled:opacity-50"><Download className="w-4 h-4" /> Download report (CSV)</button>
      </div>

      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[["Cash collected", `+${inr(d.cash_in)}`, "text-emerald-700", "cash-month-in"],
              ["Total expenses", `−${inr(d.total_expenses)}`, "text-rose-600", "cash-month-expenses"],
              ["Handed to owner / bank", `−${inr(d.total_handover)}`, "text-sky-700", "cash-month-handover"],
              ["Net cash this month", inr(d.net_cash), d.net_cash < 0 ? "text-rose-600" : "text-slate-900", "cash-month-net"]].map(([l, v, c, tid]) => (
              <div key={l} className="card-light !p-4" data-testid={tid}>
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{l}</div>
                <div className={`text-2xl font-bold font-playfair mt-1 ${c}`}>{v}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 -mt-2">{d.entries.length} entries · {d.bills_kept} with bill at counter · {d.no_bill} without bill</p>

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="card-light" data-testid="cash-month-by-category">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><PieChart className="w-4 h-4 text-fuchsia-500" /> By category</h3>
              {d.by_category.length === 0 && <p className="text-sm text-slate-400">No expenses this month.</p>}
              <div className="space-y-2.5">
                {d.by_category.map(c => (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm"><span className="text-slate-700">{CAT_LABEL[c.category] || c.category}</span><span className="font-semibold text-slate-800">{inr(c.amount)} <span className="text-slate-400 font-normal text-xs">{c.pct}%</span></span></div>
                    <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className={`h-full rounded-full ${BAR[c.category] || BAR.other}`} style={{ width: `${(c.amount / maxCat) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-light" data-testid="cash-month-by-staff">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-sky-500" /> By staff</h3>
              {d.by_staff.length === 0 && <p className="text-sm text-slate-400">Nobody has logged expenses this month.</p>}
              <table className="w-full text-sm">
                <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="text-left pb-2">Name</th><th className="text-right pb-2">Entries</th><th className="text-right pb-2">With bill</th><th className="text-right pb-2">Amount</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.by_staff.map(s => (
                    <tr key={s.name}><td className="py-2 text-slate-800">{s.name}</td><td className="py-2 text-right text-slate-500">{s.n}</td>
                      <td className="py-2 text-right"><span className={`text-xs font-semibold ${s.with_bill === s.n ? "text-emerald-600" : "text-amber-600"}`}>{s.with_bill}/{s.n}</span></td>
                      <td className="py-2 text-right font-semibold text-slate-800">{inr(s.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-light" data-testid="cash-month-by-day">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><CalendarDays className="w-4 h-4 text-slate-500" /> Day by day</h3>
            {d.by_day.length === 0 ? <p className="text-sm text-slate-400">Nothing logged yet.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {d.by_day.map(r => (
                  <div key={r.date} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" title={`${r.n} entries · handed over ${inr(r.handover)}`}>
                    <div className="text-slate-400">{r.date.slice(8)} {new Date(`${r.date}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</div>
                    <div className="font-semibold text-rose-600">−{inr(r.expenses)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

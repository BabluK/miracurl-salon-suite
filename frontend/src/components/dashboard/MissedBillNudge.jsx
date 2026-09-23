import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ReceiptText, X, ArrowRight } from "lucide-react";
import api from "@/lib/api";

export function MissedBillNudge() {
  const [items, setItems] = useState([]);
  const [days, setDays] = useState(2);
  const [busy, setBusy] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/appointments/unbilled-recent").then(r => { setItems(r.data.items || []); setDays(r.data.days || 2); }).catch(() => {});
  }, []);

  if (items.length === 0) return null;

  async function dismiss(a) {
    setBusy(a.id);
    try {
      await api.post(`/appointments/${a.id}/dismiss-unbilled`);
      setItems(prev => prev.filter(x => x.id !== a.id));
      toast.success(`${a.customer_name} skipped — won't be asked again`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't dismiss");
    } finally { setBusy(""); }
  }

  return (
    <div className="dash-cream-card rounded-3xl overflow-hidden" data-testid="missed-bill-nudge">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow"><ReceiptText className="w-5 h-5" /></div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.2em] text-amber-700 font-semibold">Missed bills</div>
          <div className="text-lg font-bold text-slate-900 leading-tight" data-testid="missed-bill-count">
            {items.length} completed appointment{items.length === 1 ? "" : "s"} from the last {days} days {items.length === 1 ? "has" : "have"} no bill
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Tap <b>Bill now</b> — the POS opens pre-filled with the booking and the bill date already set to that day.</div>
        </div>
      </div>
      <ul className="divide-y divide-amber-100 border-t border-amber-100">
        {items.map(a => (
          <li key={a.id} className="px-5 py-3 flex flex-wrap items-center gap-3 bg-white/60" data-testid={`missed-bill-row-${a.id}`}>
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-semibold text-slate-800">{a.customer_name || "Guest"}</div>
              <div className="text-xs text-slate-500 truncate">
                {a.time_label}{a.staff_name ? ` · ${a.staff_name}` : ""}{(a.service_names || []).length ? ` · ${a.service_names.join(", ")}` : ""}
              </div>
            </div>
            {a.total > 0 && <span className="text-sm font-bold text-slate-700">₹{Number(a.total).toLocaleString("en-IN")}</span>}
            <button type="button" data-testid={`missed-bill-now-${a.id}`}
              onClick={() => navigate(`/pos?appointment=${a.id}&bill_date=${a.bill_date}`)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-amber-300 text-xs font-bold px-3.5 py-1.5 hover:bg-slate-800 transition">
              Bill now <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" data-testid={`missed-bill-dismiss-${a.id}`} disabled={busy === a.id} onClick={() => dismiss(a)}
              title="Guest didn't pay / no service — hide this"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 text-slate-500 text-xs font-semibold px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
              <X className="w-3.5 h-3.5" /> Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

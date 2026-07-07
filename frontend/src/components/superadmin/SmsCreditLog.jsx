import { useEffect, useState } from "react";
import api from "@/lib/api";
import { MessageSquare, ChevronDown, ChevronUp, IndianRupee, UserCog } from "lucide-react";

// HQ view: every SMS point credit — tenant Razorpay purchases + manual HQ credits.
export function SmsCreditLog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (open && rows === null) {
      api.get("/super-admin/sms-credits").then(r => setRows(r.data)).catch(() => setRows([]));
    }
  }, [open, rows]);

  return (
    <div className="card-light p-0 overflow-hidden mt-4" data-testid="sms-credit-log">
      <button data-testid="sms-credit-log-toggle" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <MessageSquare className="w-4 h-4 text-emerald-600" /> SMS recharge history
          <span className="text-[10px] text-slate-400 font-normal">(Razorpay purchases land in your Razorpay account · manual credits are free)</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 max-h-80 overflow-y-auto">
          {rows === null ? (
            <div className="p-5 text-xs text-slate-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-5 text-xs text-slate-400">No SMS credits yet.</div>
          ) : (
            <table className="luxe-table-light">
              <thead><tr><th>When</th><th>Salon</th><th>Points</th><th>Source</th><th>Amount</th><th>By</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} data-testid={`sms-credit-row-${r.id}`}>
                    <td className="text-xs text-slate-500 whitespace-nowrap">{(r.at || "").slice(0, 16).replace("T", " ")}</td>
                    <td className="text-xs font-medium">{r.tenant_name}</td>
                    <td className="text-xs font-bold text-emerald-700">+{r.points}</td>
                    <td>
                      {(r.source || "manual") === "razorpay" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200"><IndianRupee className="w-2.5 h-2.5" /> Razorpay</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"><UserCog className="w-2.5 h-2.5" /> Manual</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-600">{r.amount ? `₹${r.amount}` : "—"}</td>
                    <td className="text-[11px] text-slate-400">{r.credited_by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

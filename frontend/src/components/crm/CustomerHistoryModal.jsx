import { useEffect, useState } from "react";
import api from "@/lib/api";
import { X, History, CreditCard } from "lucide-react";
import { payLabel } from "@/components/pos/payLabels";

export function CustomerHistoryModal({ customer, onClose }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get(`/customers/${customer.id}/history`)
      .then(({ data }) => setRows(data))
      .catch(() => setRows([]));
  }, [customer.id]);

  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch { return (iso || "").slice(0, 10); }
  };
  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()} data-testid="customer-history-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <History className="w-5 h-5 text-sky-500" /> {customer.name}&apos;s visit history
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{customer.phone} · every service, date-wise</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="customer-history-close-btn"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {rows === null && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
          {rows?.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No bills yet — their first visit will show up here.</p>}
          {rows?.map(inv => (
            <div key={inv.invoice_no} className="rounded-xl border border-slate-200 p-3" data-testid={`history-bill-${inv.invoice_no}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-bold text-slate-800">{fmtDate(inv.created_at)}</span>
                  <span className="text-xs text-slate-400 ml-2">{fmtTime(inv.created_at)} · {inv.invoice_no}</span>
                </div>
                <div className="flex items-center gap-2">
                  {inv.status === "open"
                    ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">Open</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200"><CreditCard className="w-3 h-3" />{payLabel(inv.payment_mode)}</span>}
                  <span className="text-sm font-bold text-slate-900">₹{Number(inv.total || 0).toLocaleString("en-IN")}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(inv.items || []).map((it, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600">
                    {it.name}{(it.qty || 1) > 1 ? ` ×${it.qty}` : ""}{it.staff_name ? <span className="text-slate-400"> · {it.staff_name}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

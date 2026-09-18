import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { FileText, Download, Receipt } from "lucide-react";

// Tenant → every payment (plans + credit packs) with a downloadable GST tax invoice.
export const PaymentsInvoicesCard = () => {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/billing/my-payments").then(r => setRows(r.data)).catch(() => setRows([])); }, []);
  const open = async (p) => {
    try {
      const r = await api.get(`/billing/my-payments/${p.id}/invoice.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data); window.open(url, "_blank", "noopener");
    } catch { toast.error("Couldn't generate the invoice"); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-testid="payments-invoices-card">
      <div className="flex items-center gap-2 mb-1"><Receipt className="w-5 h-5 text-[#b8860b]" /><h3 className="font-semibold text-slate-900">Payments & GST invoices</h3></div>
      <p className="text-xs text-slate-500 mb-3">Every subscription and credit-pack payment, with a downloadable tax invoice (CGST/SGST split, Miracurl GSTIN & MSME).</p>
      {rows === null ? <div className="h-16 animate-pulse bg-slate-50 rounded-xl" /> : rows.length === 0 ? (
        <div className="text-sm text-slate-500" data-testid="payments-empty">No payments yet — invoices will appear here after your first payment.</div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto" data-testid="payments-list">
          {rows.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2.5" data-testid={`payment-row-${p.id}`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{p.label}</div>
                <div className="text-[11px] text-slate-500">{(p.paid_at || "").slice(0, 10)}{p.invoice_no ? ` · ${p.invoice_no}` : ""}{p.tax?.gst ? ` · incl. GST ₹${p.tax.gst}` : ""}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-sm font-bold text-slate-900">₹{Number(p.amount || 0).toLocaleString("en-IN")}</div>
                <button onClick={() => open(p)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50" data-testid={`payment-invoice-${p.id}`}><FileText className="w-3.5 h-3.5" /> Invoice <Download className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { FileText } from "lucide-react";
import { InvoiceDocButtons, fmtAmt } from "@/lib/invoiceDocs";

export function InvoicesCard() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/billing/invoices").then(r => setRows(r.data.invoices)).catch(() => setRows([])); }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-invoices-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><FileText className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-800">Invoices &amp; receipts</h2>
          <p className="text-xs text-slate-500 mt-1">Every subscription payment comes with a tax invoice, payment receipt and the Terms &amp; Conditions — emailed to you and downloadable here anytime.</p>
          <div className="mt-4 divide-y divide-slate-100">
            {rows.map(inv => (
              <div key={inv.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" data-testid={`invoice-row-${inv.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">{inv.number} <span className="text-slate-400 font-normal">· {inv.issued_on}</span></div>
                  <div className="text-xs text-slate-500 truncate">{inv.plan_label} · {inv.period_start} → {inv.period_end} · {inv.method}{inv.txn_ref ? ` · ${inv.txn_ref}` : ""}</div>
                </div>
                <div className="text-sm font-bold text-slate-800 sm:w-24 sm:text-right" data-testid={`invoice-amount-${inv.id}`}>{fmtAmt(inv)}</div>
                <InvoiceDocButtons base="/billing/invoices" inv={inv} testPrefix="dl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

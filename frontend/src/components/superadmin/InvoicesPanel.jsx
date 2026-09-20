import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, FileText, Loader2, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { InvoiceDocButtons, fmtAmt } from "@/lib/invoiceDocs";

const inp = "mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white";
const lbl = "text-[10px] uppercase tracking-wide text-slate-500 block";
const FIELDS = [
  ["legal_name", "Legal / trade name *"], ["gstin", "GSTIN (15 chars, blank if unregistered)"], ["pan", "PAN"],
  ["gst_rate", "GST rate % (used only when GSTIN is set)"], ["email", "Billing email"], ["phone", "Billing phone"],
  ["signatory", "Authorised signatory"], ["address", "Registered address"],
];

function BillerIdentity() {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/super-admin/billing-identity").then(r => setF(r.data)).catch(() => {}); }, []);
  if (!f) return null;
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/super-admin/billing-identity", { ...f, gst_rate: Number(f.gst_rate || 0) }); setF(data); toast.success("Billing identity saved — used on every new invoice"); }
    catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Couldn't save"); }
    setBusy(false);
  };
  return (
    <details className="bg-white rounded-2xl border border-slate-200 shadow-sm" data-testid="biller-identity-card">
      <summary className="px-5 py-4 cursor-pointer flex items-center gap-3 select-none">
        <Building2 className="w-4 h-4 text-amber-600" />
        <span className="text-base font-semibold text-slate-800">Billing identity on invoices</span>
        <span className="text-xs text-slate-500 ml-auto">{f.gstin ? `GST registered · ${f.gstin}` : "GST not applicable"}</span>
      </summary>
      <div className="px-5 pb-5 grid sm:grid-cols-2 gap-3">
        {FIELDS.map(([k, label]) => (
          <label key={k} className={`${lbl} ${k === "address" ? "sm:col-span-2" : ""}`}>{label}
            <input value={f[k] ?? ""} onChange={e => setF({ ...f, [k]: e.target.value })} className={inp} data-testid={`biller-${k}`} />
          </label>
        ))}
        <div className="sm:col-span-2 flex justify-end">
          <button onClick={save} disabled={busy} data-testid="biller-save" className="h-9 px-4 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save identity
          </button>
        </div>
      </div>
    </details>
  );
}

export function InvoicesPanel() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.get("/super-admin/invoices").then(r => setRows(r.data.invoices)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const voidInv = async (inv) => {
    if (!window.confirm(`Void ${inv.invoice_no} (₹${Number(inv.total || inv.amount || 0).toLocaleString("en-IN")})? It stays for audit but disappears from lists and the tenant's Billing.`)) return;
    try { await api.delete(`/super-admin/invoices/${inv.id}`); toast.success(`${inv.invoice_no} voided`); load(); } catch (e) { toast.error(e.response?.data?.detail || "Couldn't void"); }
  };
  const resend = async (inv) => {
    setBusy(inv.id);
    try { const { data } = await api.post(`/super-admin/invoices/${inv.id}/resend`); toast.success(`Sent to ${data.sent_to} + HQ copies`); load(); }
    catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Resend failed"); }
    setBusy("");
  };
  const backfill = async () => {
    setBusy("backfill");
    try { const { data } = await api.post("/super-admin/invoices/backfill"); toast.success(`${data.created} invoice(s) generated for older payments`); load(); }
    catch (e) { toast.error("Backfill failed"); }
    setBusy("");
  };

  return (
    <div className="space-y-4" data-testid="invoices-panel">
      <BillerIdentity />
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <FileText className="w-4 h-4 text-amber-600" />
          <h3 className="text-base font-semibold text-slate-800">Subscription invoices</h3>
          <span className="text-xs text-slate-500">{rows.length} issued · every paid subscription emails the owner + billing@, booking@ and payments@ with Invoice, Receipt and T&amp;C PDFs</span>
          <button onClick={backfill} disabled={!!busy} data-testid="invoices-backfill" className="ml-auto h-8 px-3 rounded-full border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50">
            {busy === "backfill" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Generate for older payments
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="luxe-table-light">
            <thead><tr><th>Invoice</th><th>Salon</th><th>Plan · period</th><th>Amount</th><th>Payment</th><th>Email</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="7" className="text-center text-slate-400 py-8 text-sm">No invoices yet — they appear automatically after the first paid subscription.</td></tr>
              ) : rows.map(inv => (
                <tr key={inv.id} data-testid={`hq-invoice-row-${inv.id}`}>
                  <td><div className="font-semibold text-slate-800">{inv.number}</div><div className="text-[10px] text-slate-400">{inv.issued_on}</div></td>
                  <td><div className="font-medium text-slate-800">{inv.tenant_name}</div><div className="text-[10px] text-slate-400 font-mono">{inv.tenant_slug}</div></td>
                  <td className="text-xs">{inv.plan_label}{inv.kind === "trial" && <span className="ml-1.5 px-1.5 py-px rounded-full bg-sky-100 text-sky-700 text-[9px] font-bold uppercase tracking-wider" data-testid={`hq-invoice-trial-badge-${inv.id}`}>free trial</span>}<div className="text-[10px] text-slate-400">{inv.period_start} → {inv.period_end}</div></td>
                  <td className="font-semibold text-slate-800">{fmtAmt(inv)}</td>
                  <td className="text-xs">{inv.method}<div className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]">{inv.txn_ref || "—"}</div></td>
                  <td className="text-xs">
                    {inv.email?.sent ? <span className="text-emerald-700">✓ {inv.email.to}</span>
                      : inv.email ? <span className="text-rose-600" title={inv.email.error}>✗ failed</span>
                      : <span className="text-slate-400">not emailed</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      <InvoiceDocButtons base="/super-admin/invoices" inv={inv} testPrefix="hq-dl" />
                      <button onClick={() => resend(inv)} disabled={!!busy} data-testid={`hq-invoice-resend-${inv.id}`} title="Resend documents by email (to the tenant's current owner email)" className="p-1.5 text-sky-600 hover:text-sky-800 disabled:opacity-50">
                        {busy === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                      <button onClick={() => voidInv(inv)} disabled={!!busy} data-testid={`hq-invoice-void-${inv.id}`} title="Void this invoice (duplicate / issued by mistake)" className="p-1.5 text-rose-500 hover:text-rose-700 disabled:opacity-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

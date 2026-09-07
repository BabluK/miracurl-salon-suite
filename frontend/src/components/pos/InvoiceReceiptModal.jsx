import { useState } from "react";
import { Printer, Share2, FileDown, Loader2, Mail, CheckCircle2, MessageSquare } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import ThermalPrintButton from "@/components/pos/ThermalPrintButton";
import { payLabel } from "@/components/pos/payLabels";
import { curSym } from "@/lib/currency";

export default function InvoiceReceiptModal({ invoice, tenant, customer, onEmailSaved, onClose, onPrint, onShare }) {
  const sym = curSym(tenant);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailAdded, setEmailAdded] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sentTo, setSentTo] = useState(invoice.receipts?.email?.sent ? (invoice.receipts.email.to || customer?.email || "") : "");

  async function emailInvoice() {
    const target = (customer?.email || email).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) { toast.error("Enter the guest's email address first"); return; }
    setSendBusy(true);
    try {
      const { data } = await api.post(`/invoices/${invoice.id}/email`, { email: target });
      setSentTo(data.to);
      if (!customer?.email) { setEmailAdded(true); onEmailSaved?.(customer?.id, data.to); }
      toast.success(`GST invoice PDF emailed to ${data.to}`);
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Couldn't email the invoice");
    } finally { setSendBusy(false); }
  }

  async function saveEmail() {
    const clean = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) { toast.error("Enter a valid email address"); return; }
    setEmailBusy(true);
    try {
      await api.put(`/customers/${customer.id}`, {
        name: customer.name, phone: customer.phone, email: clean,
        gender: customer.gender, dob: customer.dob, anniversary: customer.anniversary,
        address: customer.address, notes: customer.notes,
      });
      setEmailAdded(true);
      onEmailSaved?.(customer.id, clean);
      toast.success("Email saved — bills will now be emailed to this guest automatically");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save the email");
    } finally { setEmailBusy(false); }
  }
  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const res = await api.get(`/invoices/${invoice.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoice_no || "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Invoice PDF downloaded — open it to print on any connected printer");
    } catch {
      toast.error("Couldn't generate the PDF");
    } finally { setPdfBusy(false); }
  }
  const brandName = tenant?.name || "Your Salon";
  const brandLoc = tenant?.location || "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[92vh] overflow-hidden" onClick={e => e.stopPropagation()} data-testid="invoice-receipt-modal">
        <div className="text-center px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-2xl font-playfair text-sky-600" data-testid="receipt-brand">{brandName} ✦</h3>
          {brandLoc && <p className="text-xs text-slate-500">{brandLoc}</p>}
          <p className="text-[10px] text-slate-400 mt-1">{new Date(invoice.created_at).toLocaleString()}</p>
        </div>
        {/* Scrollable middle — details + services; totals & actions stay locked below */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6" data-testid="receipt-scroll-area">
        <div className="py-4 space-y-2 text-sm">
          <Row label="Invoice #" value={<span className="font-mono">{invoice.invoice_no}</span>} />
          <Row label="Customer" value={invoice.customer_name} />
          {invoice.staff_name && <Row label="Stylist" value={invoice.staff_name} />}
          <Row label="Payment" value={<span className="text-sky-600 font-medium" data-testid="receipt-payment-mode">{payLabel(invoice.payment_mode)}</span>} />
          {invoice.branch_name && <Row label="Branch" value={invoice.branch_name} />}
        </div>
        {(invoice.receipts?.email?.sent || invoice.receipts?.sms?.sent) && (
          <div className="flex flex-wrap gap-2 pb-3" data-testid="receipt-delivery-status">
            {invoice.receipts?.email?.sent && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" /> Emailed to guest
              </span>
            )}
            {invoice.receipts?.sms?.sent && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <MessageSquare className="w-3 h-3" /> SMS receipt sent
              </span>
            )}
          </div>
        )}
        {customer && !customer.email && !emailAdded && (
          <div className="pb-3" data-testid="receipt-add-email-section">
            <p className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1">
              <Mail className="w-3 h-3" /> No email on file — enter one, then tap “Email invoice” below (it's saved for next time)
            </p>
            <div className="flex gap-2">
              <input data-testid="receipt-email-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="guest@email.com"
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" />
              <button data-testid="receipt-email-save-btn" onClick={saveEmail} disabled={emailBusy}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50">
                {emailBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
        <div className="border-t border-slate-100 pt-3 pb-4 space-y-1 text-sm">
          {invoice.items.map((it, idx) => (
            <div key={`${it.type}:${it.ref_id}:${idx}`} className="flex justify-between">
              <div>
                <div className="text-slate-800">{it.name} × {it.qty}</div>
                {it.staff_name && <div className="text-[10px] text-slate-500">by {it.staff_name}</div>}
              </div>
              <span className="text-slate-800">{sym}{(it.qty * it.price).toFixed(2)}</span>
            </div>
          ))}
        </div>
        </div>
        {/* Locked footer — totals always visible */}
        <div className="shrink-0 px-6 pb-5 pt-3 border-t border-slate-200 bg-white shadow-[0_-6px_16px_-12px_rgba(15,23,42,0.25)]">
        <div className="space-y-1 text-sm">
          <Row label="Subtotal" value={`${sym}${invoice.subtotal.toFixed(2)}`} />
          <Row label="Discount" value={`−${sym}${invoice.discount.toFixed(2)}`} />
          {Number(invoice.tax) > 0 && <Row label="Tax" value={`${sym}${invoice.tax.toFixed(2)}`} />}
          <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200"><span>Total</span><span className="text-sky-600">{sym}{invoice.total.toFixed(2)}</span></div>
          {Number(invoice.tip) > 0 && (
            <>
              <Row label={`Tip 💜${invoice.tip_staff_name ? ` (for ${invoice.tip_staff_name})` : ""}`} value={`${sym}${invoice.tip.toFixed(2)}`} />
              <div className="flex justify-between font-bold text-lg pt-1" data-testid="receipt-total-incl-tip"><span>Total incl. tip</span><span className="text-rose-600">{sym}{(invoice.total + invoice.tip).toFixed(2)}</span></div>
            </>
          )}
          {Number(invoice.wallet_applied) > 0 && (
            <Row label="💰 Paid from wallet" value={<span className="text-emerald-600 font-semibold">−{sym}{Number(invoice.wallet_applied).toFixed(2)}</span>} />
          )}
        </div>
        <ThermalPrintButton invoice={invoice} tenant={tenant} />
        <div className="flex items-center gap-2 mt-3">
          <button data-testid="invoice-print-btn" onClick={onPrint} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center justify-center gap-1.5"><Printer className="w-3.5 h-3.5" /> Print</button>
          <button data-testid="invoice-email-btn" onClick={emailInvoice} disabled={sendBusy} title={sentTo ? `Sent to ${sentTo} — tap to resend` : "Email the GST-ready invoice PDF to the guest"}
            className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 ${sentTo ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            {sendBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : sentTo ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />} {sentTo ? "Emailed" : "Email invoice"}
          </button>
          <button data-testid="invoice-pdf-btn" onClick={downloadPdf} disabled={pdfBusy} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center justify-center gap-1.5 disabled:opacity-50">{pdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF</button>
          {onShare && (
            <button data-testid="invoice-whatsapp-btn" onClick={onShare} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center justify-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> WhatsApp</button>
          )}
          <button data-testid="invoice-close-btn" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600">Close</button>
        </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}


import { Printer, Share2 } from "lucide-react";

export default function InvoiceReceiptModal({ invoice, tenant, onClose, onPrint, onShare }) {
  const brandName = tenant?.name || "Your Salon";
  const brandLoc = tenant?.location || "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()} data-testid="invoice-receipt-modal">
        <div className="text-center pb-4 border-b border-slate-100">
          <h3 className="text-2xl font-playfair text-sky-600" data-testid="receipt-brand">{brandName} ✦</h3>
          {brandLoc && <p className="text-xs text-slate-500">{brandLoc}</p>}
          <p className="text-[10px] text-slate-400 mt-1">{new Date(invoice.created_at).toLocaleString()}</p>
        </div>
        <div className="py-4 space-y-2 text-sm">
          <Row label="Invoice #" value={<span className="font-mono">{invoice.invoice_no}</span>} />
          <Row label="Customer" value={invoice.customer_name} />
          {invoice.staff_name && <Row label="Stylist" value={invoice.staff_name} />}
          <Row label="Payment" value={<span className="uppercase text-sky-600">{invoice.payment_mode}</span>} />
          {invoice.branch_name && <Row label="Branch" value={invoice.branch_name} />}
        </div>
        <div className="border-t border-slate-100 pt-3 space-y-1 text-sm">
          {invoice.items.map((it, idx) => (
            <div key={`${it.type}:${it.ref_id}:${idx}`} className="flex justify-between">
              <div>
                <div className="text-slate-800">{it.name} × {it.qty}</div>
                {it.staff_name && <div className="text-[10px] text-slate-500">by {it.staff_name}</div>}
              </div>
              <span className="text-slate-800">₹{(it.qty * it.price).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-3 mt-3 space-y-1 text-sm">
          <Row label="Subtotal" value={`₹${invoice.subtotal.toFixed(2)}`} />
          <Row label="Discount" value={`−₹${invoice.discount.toFixed(2)}`} />
          {Number(invoice.tax) > 0 && <Row label="Tax" value={`₹${invoice.tax.toFixed(2)}`} />}
          <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200"><span>Total</span><span className="text-sky-600">₹{invoice.total.toFixed(2)}</span></div>
        </div>
        <div className="flex items-center gap-2 mt-5">
          <button data-testid="invoice-print-btn" onClick={onPrint} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center justify-center gap-1.5"><Printer className="w-3.5 h-3.5" /> Print</button>
          <button data-testid="invoice-whatsapp-btn" onClick={onShare} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center justify-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> WhatsApp</button>
          <button data-testid="invoice-close-btn" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600">Close</button>
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


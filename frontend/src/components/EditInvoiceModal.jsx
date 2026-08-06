import { useState, useEffect } from "react";
import api from "@/lib/api";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { X, Trash2, Loader2, Save } from "lucide-react";

const MODES = ["cash", "card", "upi"];
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export const EditInvoiceModal = ({ invoice, onClose, onSaved }) => {
  const [editor, setEditor] = useState("");
  const [staffList, setStaffList] = useState(null); // [{id,name}]
  useEffect(() => {
    api.get("/staff").then(r => setStaffList(r.data.filter(s => !s.away).map(s => ({ id: s.id, name: s.name })))).catch(() => setStaffList([]));
  }, []);
  const [mode, setMode] = useState(MODES.includes(invoice.payment_mode) ? invoice.payment_mode : "cash");
  const fixed = (invoice.membership_discount || 0) + (invoice.coupon_discount || 0) + (invoice.points_used || 0);
  const [discount, setDiscount] = useState(Math.max(0, (invoice.discount || 0) - fixed));
  const [items, setItems] = useState(invoice.items.map(i => ({ ...i })));
  const [busy, setBusy] = useState(false);

  const locked = invoice.payment_mode === "salon_wallet" || (invoice.points_used || 0) > 0;
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const taxable = Math.max(0, subtotal - Math.min(Number(discount || 0) + fixed, subtotal));
  const oldTaxable = invoice.subtotal - invoice.discount;
  const taxPct = oldTaxable > 0 && invoice.tax > 0 ? (invoice.tax / oldTaxable) * 100 : 0;
  const newTotal = taxable + (taxable * taxPct) / 100;

  const setItem = (idx, k, v) => setItems(its => its.map((it, i) => i === idx ? { ...it, [k]: v } : it));

  const save = async () => {
    if (editor.trim().length < 2) { toast.error("Enter the name of who is editing this bill"); return; }
    setBusy(true);
    try {
      await pinApi.put(`/invoices/${invoice.id}`, {
        editor_name: editor.trim(), payment_mode: mode, items, manual_discount: Number(discount || 0),
      });
      toast.success(`Bill ${invoice.invoice_no} updated ✦ (audited under "${editor.trim()}")`);
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
    }
    setBusy(false);
  };

  const voidBill = async () => {
    const who = editor.trim() || window.prompt("Who is voiding this bill? (name)") || "";
    if (who.trim().length < 2) { toast.error("Name required for the audit trail"); return; }
    const reason = window.prompt(`Void bill ${invoice.invoice_no}? It will be removed from all revenue reports.\n\nReason (e.g. wrongly punched):`) ;
    if (reason === null) return;
    setBusy(true);
    try {
      await pinApi.post(`/invoices/${invoice.id}/void`, { editor_name: who.trim(), reason: reason.trim() });
      toast.success(`Bill ${invoice.invoice_no} voided — excluded from reports`);
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Void failed");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4" data-testid="edit-invoice-modal">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-playfair text-xl">Edit Bill <span className="font-mono text-sm text-slate-400">{invoice.invoice_no}</span></h3>
          <button onClick={onClose} data-testid="edit-invoice-close" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        {locked ? (
          <>
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-4" data-testid="edit-invoice-locked">
              🔒 This bill used the customer's wallet/loyalty balance and can't be edited — void it and re-bill instead.
            </p>
            <button onClick={voidBill} disabled={busy} data-testid="edit-invoice-void-btn"
              className="w-full border border-rose-300 bg-rose-50 text-rose-600 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-rose-100">
              <Trash2 className="w-4 h-4" /> Void this bill (wrongly punched)
            </button>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500">Who is editing this bill? *</label>
              {staffList && staffList.length > 0 ? (
                <select value={editor} onChange={e => setEditor(e.target.value)} data-testid="edit-invoice-editor-select"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 bg-white text-slate-800">
                  <option value="">— select who is editing —</option>
                  <option value="Owner">Owner</option>
                  {staffList.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                </select>
              ) : (
                <input value={editor} onChange={e => setEditor(e.target.value)} maxLength={60} placeholder="Staff / your name"
                  data-testid="edit-invoice-editor-input"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" />
              )}
              <p className="text-[10px] text-slate-400 mt-1">Recorded in the audit trail — the owner can review every edit in Settings.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">Payment mode</label>
              <div className="flex gap-2 mt-1">
                {MODES.map(m => (
                  <button key={m} onClick={() => setMode(m)} data-testid={`edit-invoice-mode-${m}`}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase ${mode === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{m}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500">Services / items</label>
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm" data-testid={`edit-invoice-item-${idx}`}>
                  <span className="flex-1 truncate">{it.name}</span>
                  {it.type === "service" && (
                    <select value={it.staff_id || ""} data-testid={`edit-invoice-stylist-${idx}`}
                      onChange={e => {
                        const st = (staffList || []).find(s => s.id === e.target.value);
                        setItems(its => its.map((x, i) => i === idx ? { ...x, staff_id: st?.id || null, staff_name: st?.name || null } : x));
                      }}
                      title="Stylist who did this service"
                      className="w-28 border border-slate-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-slate-800">
                      <option value="">Stylist?</option>
                      {(staffList || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  <input type="number" min={1} max={100} value={it.qty} onChange={e => setItem(idx, "qty", Math.max(1, Number(e.target.value)))}
                    className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-center" data-testid={`edit-invoice-qty-${idx}`} />
                  <input type="number" min={0} value={it.price} onChange={e => setItem(idx, "price", Math.max(0, Number(e.target.value)))}
                    className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-right" data-testid={`edit-invoice-price-${idx}`} />
                  <button onClick={() => setItems(its => its.filter((_, i) => i !== idx))} disabled={items.length === 1}
                    data-testid={`edit-invoice-remove-${idx}`}
                    className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-500">Discount (₹)</label>
              <input type="number" min={0} value={discount} onChange={e => setDiscount(e.target.value)}
                className="w-28 border border-slate-200 rounded-xl px-3 py-2 text-sm" data-testid="edit-invoice-discount-input" />
              {fixed > 0 && <span className="text-[10px] text-slate-400">+ {inr(fixed)} membership/coupon (kept)</span>}
            </div>

            <div className="bg-slate-50 rounded-xl p-4 text-sm flex justify-between" data-testid="edit-invoice-totals">
              <span className="text-slate-500">New total {taxPct > 0 && <em className="not-italic text-[10px]">(incl. {taxPct.toFixed(1)}% tax)</em>}</span>
              <b>{inr(newTotal)}</b>
            </div>

            <button onClick={save} disabled={busy} data-testid="edit-invoice-save-btn"
              className="w-full bg-slate-900 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes
            </button>
            <button onClick={voidBill} disabled={busy} data-testid="edit-invoice-void-btn"
              className="w-full border border-rose-300 bg-rose-50 text-rose-600 rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-rose-100">
              <Trash2 className="w-3.5 h-3.5" /> Void this bill (wrongly punched — removes it from reports)
            </button>
          </>
        )}
      </div>
    </div>
  );
};

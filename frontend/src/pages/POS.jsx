import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Search, ShoppingCart, X, Plus, Minus, IndianRupee, Wallet, CreditCard, Smartphone, Banknote, Receipt, Printer, Share2, Gift, Star } from "lucide-react";
import { toast } from "sonner";

export default function POS() {
  const [tab, setTab] = useState("services"); // services | products
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [taxPct] = useState(18);
  const [payment, setPayment] = useState("cash");
  const [lastInvoice, setLastInvoice] = useState(null);

  useEffect(() => {
    api.get("/services").then(r => setServices(r.data));
    api.get("/products").then(r => setProducts(r.data));
    api.get("/customers").then(r => setCustomers(r.data));
    api.get("/staff").then(r => setStaff(r.data));
  }, []);

  const items = tab === "services" ? services : products;
  const filtered = items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));

  function addToCart(it) {
    const type = tab === "services" ? "service" : "product";
    const exists = cart.find(c => c.type === type && c.ref_id === it.id);
    if (exists) {
      setCart(cart.map(c => c.type === type && c.ref_id === it.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { type, ref_id: it.id, name: it.name, qty: 1, price: it.price }]);
    }
  }
  function qty(idx, d) {
    const next = [...cart]; next[idx].qty = Math.max(1, next[idx].qty + d); setCart(next);
  }
  function removeItem(idx) { setCart(cart.filter((_, i) => i !== idx)); }

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.qty * c.price, 0), [cart]);
  const taxable = Math.max(0, subtotal - Number(discount || 0));
  const tax = taxable * taxPct / 100;
  const total = taxable + tax;

  async function checkout() {
    if (!customerId) { toast.error("Select a customer"); return; }
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    try {
      const { data } = await api.post("/invoices", {
        customer_id: customerId, staff_id: staffId || null,
        items: cart, discount: Number(discount || 0), tax_pct: taxPct, payment_mode: payment,
      });
      toast.success(`Invoice ${data.invoice_no} created`);
      setLastInvoice(data); setCart([]); setDiscount(0);
    } catch (err) { toast.error(err.response?.data?.detail || "Checkout failed"); }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function printInvoice(inv) {
    const esc = escapeHtml;
    const itemsHtml = inv.items
      .map(it => `<tr><td>${esc(it.name)} × ${Number(it.qty)}</td><td style="text-align:right">₹${(it.qty * it.price).toFixed(2)}</td></tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoice_no)}</title>
<style>
  body { font-family: 'Helvetica', Arial, sans-serif; color:#000; padding:24px; max-width:420px; margin:auto; }
  h1 { font-family: 'Georgia', serif; text-align:center; margin:0; color:#a08300; }
  .sub { text-align:center; font-size:11px; color:#666; margin-bottom:16px; }
  .row { display:flex; justify-content:space-between; font-size:12px; padding:3px 0; }
  table { width:100%; border-top:1px dashed #999; border-bottom:1px dashed #999; margin-top:12px; }
  table td { padding:4px 0; font-size:12px; }
  .total { font-family:'Georgia',serif; font-size:18px; font-weight:bold; border-top:2px solid #000; padding-top:6px; margin-top:6px; }
  .foot { text-align:center; font-size:10px; color:#888; margin-top:20px; }
</style></head><body>
<h1>Miracurl ✦</h1>
<div class="sub">Unisex Family Salon · Marathahalli<br/>${esc(new Date(inv.created_at).toLocaleString())}</div>
<div class="row"><b>Invoice #</b><span>${esc(inv.invoice_no)}</span></div>
<div class="row"><b>Customer</b><span>${esc(inv.customer_name)}</span></div>
${inv.staff_name ? `<div class="row"><b>Stylist</b><span>${esc(inv.staff_name)}</span></div>` : ""}
<div class="row"><b>Payment</b><span>${esc(String(inv.payment_mode).toUpperCase())}</span></div>
<table>${itemsHtml}</table>
<div class="row"><span>Subtotal</span><span>₹${inv.subtotal.toFixed(2)}</span></div>
<div class="row"><span>Discount</span><span>−₹${inv.discount.toFixed(2)}</span></div>
<div class="row"><span>Tax</span><span>₹${inv.tax.toFixed(2)}</span></div>
<div class="row total"><span>Total</span><span>₹${inv.total.toFixed(2)}</span></div>
<div class="foot">Thank you for visiting Miracurl ✦</div>
</body></html>`;
    // Use a hidden iframe with srcdoc — safer than window.open + document.write
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    iframe.srcdoc = html;
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch {
        toast.error("Unable to open print dialog");
      }
      setTimeout(() => iframe.remove(), 1000);
    };
    document.body.appendChild(iframe);
  }

  function shareInvoiceWhatsApp(inv) {
    const cust = customers.find(c => c.id === inv.customer_id);
    const phone = cust?.phone?.replace(/\D/g, "") || "";
    const itemLines = inv.items.map(it => `• ${it.name} × ${it.qty} — ₹${(it.qty * it.price).toFixed(0)}`).join("%0A");
    const msg = [
      `*Miracurl ✦* Receipt`,
      `Invoice ${inv.invoice_no}`,
      `Customer: ${inv.customer_name}`,
      inv.staff_name ? `Stylist: ${inv.staff_name}` : "",
      "",
      itemLines.replace(/%0A/g, "\n"),
      "",
      `Subtotal: ₹${inv.subtotal.toFixed(0)}`,
      `Discount: −₹${inv.discount.toFixed(0)}`,
      `Tax: ₹${inv.tax.toFixed(0)}`,
      `*Total: ₹${inv.total.toFixed(0)}*`,
      `Paid via ${inv.payment_mode.toUpperCase()}`,
      "",
      "Thank you for visiting Miracurl ✦",
    ].filter(Boolean).join("\n");
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function sendReviewLink(inv) {
    // Find the most recent completed appointment for this customer
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await api.get(`/appointments?date=${today}`);
      const appt = data.find(a => a.customer_id === inv.customer_id && a.status === "completed")
                 || data.find(a => a.customer_id === inv.customer_id);
      const link = appt ? `${window.location.origin}/review/${appt.id}` : `${window.location.origin}/book`;
      const cust = customers.find(c => c.id === inv.customer_id);
      const phone = cust?.phone?.replace(/\D/g, "") || "";
      const msg = `Hi ${inv.customer_name.split(" ")[0]} ✦ Thank you for visiting Miracurl today!%0A%0AWe'd love your feedback — it takes 10 seconds:%0A${link}%0A%0AGive us 4★ or 5★ and we'll add ₹50 credit to your account ✦`;
      const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Couldn't prepare review link");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      {/* Left: catalog */}
      <div className="lg:col-span-2 flex flex-col card-luxe p-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex gap-1 bg-bg-base rounded-lg p-1">
            <button data-testid="pos-tab-services" onClick={() => setTab("services")} className={`px-4 py-2 text-sm rounded-md transition ${tab === "services" ? "bg-gold text-bg-base font-semibold" : "text-ink-secondary hover:text-white"}`}>Services</button>
            <button data-testid="pos-tab-products" onClick={() => setTab("products")} className={`px-4 py-2 text-sm rounded-md transition ${tab === "products" ? "bg-gold text-bg-base font-semibold" : "text-ink-secondary hover:text-white"}`}>Products</button>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input data-testid="pos-search" className="input-luxe pl-10" placeholder={`Search ${tab}...`} value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto pr-1">
          {filtered.map(i => (
            <button key={i.id} data-testid={`pos-item-${i.id}`} onClick={() => addToCart(i)} className="text-left card-luxe p-0 overflow-hidden hover:border-gold transition-all group">
              <div className="h-20 relative">
                <img src={i.image_url || "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=200"} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-surface to-transparent" />
              </div>
              <div className="p-3">
                <div className="font-medium text-sm line-clamp-1">{i.name}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-gold text-sm">₹{i.price}</span>
                  {tab === "products" && <span className="text-[10px] text-ink-muted">{i.stock} left</span>}
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="col-span-full text-center text-ink-secondary py-12">No items found</div>}
        </div>
      </div>

      {/* Right: cart */}
      <div className="card-luxe flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 pb-3 border-b border-white/5">
          <ShoppingCart className="w-5 h-5 text-gold" />
          <h2 className="font-playfair text-xl">Current Bill</h2>
          {cart.length > 0 && <span className="ml-auto text-xs text-ink-muted">{cart.length} items</span>}
        </div>

        <div className="py-3 space-y-3 border-b border-white/5">
          <div>
            <label className="label-luxe block mb-1">Customer *</label>
            <select data-testid="pos-customer-select" className="input-luxe" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">-- choose --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
            </select>
          </div>
          <div>
            <label className="label-luxe block mb-1">Stylist</label>
            <select data-testid="pos-staff-select" className="input-luxe" value={staffId} onChange={e => setStaffId(e.target.value)}>
              <option value="">-- none --</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {cart.length === 0 ? (
            <div className="text-center text-ink-secondary py-8 text-sm">Tap items on the left to add them</div>
          ) : cart.map((c, idx) => (
            <div key={`${c.type}:${c.ref_id}`} className="flex items-center gap-2 py-2" data-testid={`cart-item-${idx}`}>
              <div className="flex-1">
                <div className="text-sm font-medium line-clamp-1">{c.name}</div>
                <div className="text-xs text-gold">₹{c.price} × {c.qty} = ₹{c.qty * c.price}</div>
              </div>
              <button onClick={() => qty(idx, -1)} className="w-7 h-7 rounded border border-white/10 hover:border-gold flex items-center justify-center"><Minus className="w-3 h-3" /></button>
              <span className="w-6 text-center text-sm">{c.qty}</span>
              <button onClick={() => qty(idx, 1)} className="w-7 h-7 rounded border border-white/10 hover:border-gold flex items-center justify-center"><Plus className="w-3 h-3" /></button>
              <button onClick={() => removeItem(idx)} className="text-ink-muted hover:text-red-400"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 pt-3 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-secondary">Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between items-center">
            <span className="text-ink-secondary">Discount</span>
            <input type="number" data-testid="pos-discount-input" className="input-luxe w-24 py-1 text-right" value={discount} onChange={e => setDiscount(e.target.value)} />
          </div>
          <div className="flex justify-between"><span className="text-ink-secondary">Tax ({taxPct}%)</span><span>₹{tax.toFixed(2)}</span></div>
          <div className="flex justify-between text-lg font-playfair pt-2 border-t border-white/5">
            <span>Total</span><span className="text-gold flex items-center"><IndianRupee className="w-4 h-4" />{total.toFixed(2)}</span>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-2">
            {[{ k: "cash", i: Banknote, l: "Cash" }, { k: "card", i: CreditCard, l: "Card" }, { k: "upi", i: Smartphone, l: "UPI" }, { k: "wallet", i: Wallet, l: "Wallet" }].map(p => (
              <button key={p.k} data-testid={`pos-pay-${p.k}`} onClick={() => setPayment(p.k)} className={`flex flex-col items-center gap-1 py-2 rounded-md border text-xs transition ${payment === p.k ? "border-gold bg-gold/10 text-gold" : "border-white/10 text-ink-secondary hover:border-white/30"}`}>
                <p.i className="w-4 h-4" /> {p.l}
              </button>
            ))}
          </div>

          <button data-testid="pos-checkout-btn" onClick={checkout} className="btn-gold w-full mt-3 flex items-center justify-center gap-2">
            <Receipt className="w-4 h-4" /> Generate Invoice
          </button>
        </div>
      </div>

      {lastInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLastInvoice(null)}>
          <div className="card-luxe w-full max-w-md mx-4" onClick={e => e.stopPropagation()} data-testid="invoice-receipt">
            <div id="printable-invoice">
              <div className="text-center pb-4 border-b border-white/10">
                <h3 className="font-playfair text-2xl gold-text">Miracurl</h3>
                <p className="text-xs text-ink-secondary">Unisex Family Salon, Marathahalli</p>
                <p className="text-[10px] text-ink-muted mt-1">{new Date(lastInvoice.created_at).toLocaleString()}</p>
              </div>
              <div className="py-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink-muted">Invoice #</span><span className="font-mono">{lastInvoice.invoice_no}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Customer</span><span>{lastInvoice.customer_name}</span></div>
                {lastInvoice.staff_name && <div className="flex justify-between"><span className="text-ink-muted">Stylist</span><span>{lastInvoice.staff_name}</span></div>}
                <div className="flex justify-between"><span className="text-ink-muted">Payment</span><span className="uppercase text-gold">{lastInvoice.payment_mode}</span></div>
              </div>
              <div className="border-t border-white/10 pt-3 space-y-1 text-sm">
                {lastInvoice.items.map((it, idx) => (
                  <div key={`${it.type}:${it.ref_id}:${idx}`} className="flex justify-between"><span>{it.name} × {it.qty}</span><span>₹{(it.qty * it.price).toFixed(2)}</span></div>
                ))}
              </div>
              <div className="border-t border-white/10 pt-3 mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>₹{lastInvoice.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Discount</span><span>−₹{lastInvoice.discount.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>₹{lastInvoice.tax.toFixed(2)}</span></div>
                <div className="flex justify-between font-playfair text-lg pt-2 border-t border-white/10"><span>Total</span><span className="text-gold">₹{lastInvoice.total.toFixed(2)}</span></div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                data-testid="invoice-print-btn"
                onClick={() => printInvoice(lastInvoice)}
                className="btn-ghost flex-1 flex items-center justify-center gap-2 text-xs"
              ><Printer className="w-3.5 h-3.5" /> Print</button>
              <button
                data-testid="invoice-whatsapp-btn"
                onClick={() => shareInvoiceWhatsApp(lastInvoice)}
                className="btn-ghost flex-1 flex items-center justify-center gap-2 text-xs"
              ><Share2 className="w-3.5 h-3.5" /> WhatsApp</button>
              <button
                data-testid="invoice-review-btn"
                onClick={() => sendReviewLink(lastInvoice)}
                className="btn-ghost flex-1 flex items-center justify-center gap-2 text-xs"
              ><Star className="w-3.5 h-3.5" /> Review Link</button>
              <button data-testid="invoice-close-btn" onClick={() => setLastInvoice(null)} className="btn-gold flex-1 text-xs">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Search, ShoppingCart, X, Plus, Minus, IndianRupee, Wallet, CreditCard, Smartphone, Banknote, Receipt } from "lucide-react";
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
            <div className="text-center pb-4 border-b border-white/10">
              <h3 className="font-playfair text-2xl gold-text">Miracurl</h3>
              <p className="text-xs text-ink-secondary">Unisex Family Salon, Marathahalli</p>
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
            <button onClick={() => setLastInvoice(null)} className="btn-gold w-full mt-4">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

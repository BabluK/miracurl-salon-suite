import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { Search, X, Plus, UserPlus, IndianRupee, Receipt, Printer, Star, Share2, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/share";

const PAYMENT_MODES = [
  { k: "cash", label: "Cash" },
  { k: "card", label: "Card" },
  { k: "upi", label: "GPay" },
  { k: "wallet", label: "Phone Pay" },
];

const TAB_BUTTONS = [
  { k: "services", label: "Add Service", live: true },
  { k: "products", label: "Add Product", live: true },
  { k: "package", label: "Add Package", live: false },
  { k: "giftcard", label: "Add GiftCard", live: false },
  { k: "membership", label: "Add Membership", live: false },
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildReceiptHtml(inv) {
  const itemsHtml = inv.items.map(it => {
    const sub = (it.qty * it.price).toFixed(2);
    const staffLine = it.staff_name
      ? `<div style="font-size:10px;color:#666">by ${escapeHtml(it.staff_name)}</div>`
      : "";
    return `<tr><td>${escapeHtml(it.name)} × ${Number(it.qty)}${staffLine}</td><td style="text-align:right">₹${sub}</td></tr>`;
  }).join("");
  const showTax = Number(inv.tax) > 0;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(inv.invoice_no)}</title>
<style>
  body{font-family:Arial,sans-serif;color:#000;padding:24px;max-width:420px;margin:auto}
  h1{font-family:Georgia,serif;text-align:center;margin:0;color:#a08300}
  .sub{text-align:center;font-size:11px;color:#666;margin-bottom:16px}
  .row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0}
  table{width:100%;border-top:1px dashed #999;border-bottom:1px dashed #999;margin-top:12px}
  table td{padding:4px 0;font-size:12px}
  .total{font-family:Georgia,serif;font-size:18px;font-weight:700;border-top:2px solid #000;padding-top:6px;margin-top:6px}
  .foot{text-align:center;font-size:10px;color:#888;margin-top:20px}
</style></head><body>
<h1>Miracurl ✦</h1>
<div class="sub">Unisex Family Salon · Marathahalli<br/>${escapeHtml(new Date(inv.created_at).toLocaleString())}</div>
<div class="row"><b>Invoice #</b><span>${escapeHtml(inv.invoice_no)}</span></div>
<div class="row"><b>Customer</b><span>${escapeHtml(inv.customer_name)}</span></div>
${inv.staff_name ? `<div class="row"><b>Stylist</b><span>${escapeHtml(inv.staff_name)}</span></div>` : ""}
<div class="row"><b>Payment</b><span>${escapeHtml(String(inv.payment_mode).toUpperCase())}</span></div>
<table>${itemsHtml}</table>
<div class="row"><span>Subtotal</span><span>₹${inv.subtotal.toFixed(2)}</span></div>
<div class="row"><span>Discount</span><span>−₹${inv.discount.toFixed(2)}</span></div>
${showTax ? `<div class="row"><span>Tax</span><span>₹${inv.tax.toFixed(2)}</span></div>` : ""}
<div class="row total"><span>Total</span><span>₹${inv.total.toFixed(2)}</span></div>
<div class="foot">Thank you for visiting Miracurl ✦</div>
</body></html>`;
}

function printInvoice(inv) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  iframe.srcdoc = buildReceiptHtml(inv);
  iframe.onload = () => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
    catch { toast.error("Unable to open print dialog"); }
    setTimeout(() => iframe.remove(), 1000);
  };
  document.body.appendChild(iframe);
}

export default function POS() {
  const [mode, setMode] = useState("services"); // services | products
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [category, setCategory] = useState(""); // selected left-column category
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestOpen, setGuestOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [taxPct, setTaxPct] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [payment, setPayment] = useState("cash");
  const [lastInvoice, setLastInvoice] = useState(null);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const guestBoxRef = useRef(null);

  const loadCustomers = useCallback(() => {
    api.get("/customers")
      .then(r => setCustomers(r.data))
      .catch(e => toast.error(`Couldn't load guests: ${e?.message || "network error"}`));
  }, []);

  useEffect(() => {
    api.get("/services").then(r => {
      setServices(r.data);
      const firstCat = [...new Set(r.data.map(s => s.category))][0];
      setCategory(c => c || firstCat || "");
    });
    api.get("/products").then(r => setProducts(r.data));
    api.get("/staff").then(r => setStaff(r.data));
    api.get("/settings/tax")
      .then(r => { setTaxEnabled(!!r.data.tax_enabled); setTaxPct(Number(r.data.tax_pct || 0)); })
      .catch(() => { setTaxEnabled(false); setTaxPct(0); });
    loadCustomers();
  }, [loadCustomers]);

  // Close guest dropdown when clicking outside
  useEffect(() => {
    function onDoc(e) {
      if (guestBoxRef.current && !guestBoxRef.current.contains(e.target)) {
        setGuestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const catalog = mode === "services" ? services : products;
  const categories = useMemo(() => [...new Set(catalog.map(i => i.category || "Other"))], [catalog]);

  // Reset selected category when switching mode
  useEffect(() => {
    if (categories.length && !categories.includes(category)) setCategory(categories[0]);
  }, [categories, category]);

  const filtered = useMemo(() => catalog.filter(i =>
    (!category || (i.category || "Other") === category) &&
    (!q || i.name.toLowerCase().includes(q.toLowerCase())),
  ), [catalog, category, q]);

  const customer = useMemo(() => customers.find(c => c.id === customerId), [customers, customerId]);

  // Guest typeahead — only filter when user has typed at least 1 character.
  const guestMatches = useMemo(() => {
    const q = guestQuery.trim().toLowerCase();
    if (!q) return [];
    return customers.filter(c => {
      const name = (c.name || "").toLowerCase();
      const phone = String(c.phone || "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    }).slice(0, 8);
  }, [customers, guestQuery]);

  function selectGuest(c) {
    setCustomerId(c.id);
    setGuestQuery(`${c.name} · ${c.phone}`);
    setGuestOpen(false);
  }
  function clearGuest() {
    setCustomerId("");
    setGuestQuery("");
    setGuestOpen(false);
  }

  function addToCart(it) {
    const type = mode === "services" ? "service" : "product";
    const existsIdx = cart.findIndex(c => c.type === type && c.ref_id === it.id);
    if (existsIdx >= 0) {
      const next = [...cart]; next[existsIdx] = { ...next[existsIdx], qty: next[existsIdx].qty + 1 };
      setCart(next);
    } else {
      // Pre-fill staff if a default stylist is selected at the invoice level
      const defaultStaff = staff.find(s => s.id === staffId);
      setCart([...cart, {
        type, ref_id: it.id, name: it.name, qty: 1, price: it.price, disc_pct: 0,
        staff_id: defaultStaff?.id || "",
        staff_name: defaultStaff?.name || "",
      }]);
    }
  }
  function updateLine(i, patch) { setCart(cart.map((c, idx) => idx === i ? { ...c, ...patch } : c)); }
  function setLineStaff(i, sid) {
    const s = staff.find(x => x.id === sid);
    updateLine(i, { staff_id: sid, staff_name: s?.name || "" });
  }
  function removeLine(i) { setCart(cart.filter((_, idx) => idx !== i)); }

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.qty * c.price, 0), [cart]);
  const lineDiscount = useMemo(() =>
    cart.reduce((s, c) => s + (c.qty * c.price) * ((c.disc_pct || 0) / 100), 0),
  [cart]);
  const totalDiscount = lineDiscount;
  const taxable = Math.max(0, subtotal - totalDiscount);
  const tax = taxable * taxPct / 100;
  const total = taxable + tax;

  function clearAll() {
    setCart([]); setOrderNotes(""); setStaffId("");
    setCustomerId(""); setGuestQuery(""); setGuestOpen(false); setPayment("cash");
  }

  async function checkout(complete = true) {
    if (!customerId) { toast.error("Please select a guest"); return; }
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    try {
      const { data } = await api.post("/invoices", {
        customer_id: customerId,
        staff_id: staffId || null,
        items: cart.map(({ type, ref_id, name, qty, price, staff_id, staff_name }) => ({
          type, ref_id, name, qty, price,
          staff_id: staff_id || null, staff_name: staff_name || null,
        })),
        discount: totalDiscount,
        tax_pct: taxPct,
        payment_mode: payment,
      });
      toast.success(`Invoice ${data.invoice_no} created`);
      setLastInvoice(data);
      if (complete) clearAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Checkout failed"); }
  }

  function shareInvoiceWhatsApp(inv) {
    const cust = customers.find(c => c.id === inv.customer_id);
    const phone = cust?.phone?.replace(/\D/g, "") || "";
    const itemLines = inv.items.map(it => {
      const staffPart = it.staff_name ? ` (by ${it.staff_name})` : "";
      return `• ${it.name} × ${it.qty}${staffPart} — ₹${(it.qty * it.price).toFixed(0)}`;
    }).join("\n");
    const msg = [
      `*Miracurl ✦* Receipt`,
      `Invoice ${inv.invoice_no}`,
      `Customer: ${inv.customer_name}`,
      inv.staff_name ? `Stylist: ${inv.staff_name}` : "",
      "",
      itemLines,
      "",
      `Subtotal: ₹${inv.subtotal.toFixed(0)}`,
      `Discount: −₹${inv.discount.toFixed(0)}`,
      Number(inv.tax) > 0 ? `Tax: ₹${inv.tax.toFixed(0)}` : "",
      `*Total: ₹${inv.total.toFixed(0)}*`,
      `Paid via ${inv.payment_mode.toUpperCase()}`,
      "",
      "Thank you for visiting Miracurl ✦",
    ].filter(Boolean).join("\n");
    openWhatsApp(msg, phone);
  }

  return (
    <div className="bg-slate-50 -mx-6 -my-6 px-6 py-6 min-h-[calc(100vh-4rem)] text-slate-800" data-testid="pos-page">
      {/* Header bar — category mode + search + add buttons */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="pos-search"
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="Search Service"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
          {TAB_BUTTONS.map(b => (
            <button
              key={b.k}
              data-testid={`pos-tab-${b.k}`}
              onClick={() => b.live && setMode(b.k)}
              disabled={!b.live}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                mode === b.k
                  ? "bg-sky-50 border-sky-300 text-sky-600"
                  : b.live
                    ? "bg-white border-slate-200 text-slate-700 hover:border-sky-200 hover:text-sky-600"
                    : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Categories + Service tiles */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {categories.map(c => (
              <button
                key={c}
                data-testid={`pos-category-${c.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => setCategory(c)}
                className={`rounded-xl py-6 text-sm font-semibold uppercase tracking-wider border transition shadow-sm ${
                  category === c
                    ? "bg-sky-50 border-sky-400 text-sky-600 ring-2 ring-sky-200"
                    : "bg-white border-slate-200 text-slate-600 hover:border-sky-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-base font-semibold text-slate-700 mb-3">{category || "All items"}</h3>
            <div className="grid grid-cols-2 gap-2 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
              {filtered.map(i => (
                <button
                  key={i.id}
                  data-testid={`pos-item-${i.id}`}
                  onClick={() => addToCart(i)}
                  className="text-left rounded-lg border border-slate-200 hover:border-sky-300 hover:shadow-sm transition px-3 py-2.5 flex items-center justify-between gap-2 bg-white"
                >
                  <span className="text-sm text-slate-700 line-clamp-2">{i.name}</span>
                  <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{i.price}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-2 text-center text-slate-400 py-8 text-sm">No items in this category</div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Invoice */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Invoice header */}
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-700">Invoice</h3>
              <div className="flex items-center gap-1 text-sm text-slate-500">
                <Calendar className="w-4 h-4" />
                {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-600 font-medium">Guest :</label>
              <div className="relative flex-1 max-w-md" ref={guestBoxRef}>
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  data-testid="pos-guest-search"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Search by name or phone…"
                  value={guestQuery}
                  onChange={e => {
                    setGuestQuery(e.target.value);
                    if (customerId) setCustomerId("");
                    setGuestOpen(e.target.value.trim().length > 0);
                  }}
                  onFocus={() => { if (guestQuery.trim()) setGuestOpen(true); }}
                  className="text-slate-800 w-full pl-10 pr-9 py-2 rounded-lg bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
                {(guestQuery || customerId) && (
                  <button
                    type="button"
                    data-testid="pos-guest-clear"
                    onClick={clearGuest}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Clear guest"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {guestOpen && guestQuery.trim() && (
                  <div
                    data-testid="pos-guest-dropdown"
                    className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto"
                  >
                    {guestMatches.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-slate-500">
                        No guests match &quot;{guestQuery}&quot;. <button onClick={() => { setGuestOpen(false); setAddGuestOpen(true); }} className="text-sky-600 font-medium hover:underline" data-testid="pos-guest-add-from-search">Add new guest</button>
                      </div>
                    ) : (
                      guestMatches.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          data-testid={`pos-guest-option-${c.id}`}
                          onClick={() => selectGuest(c)}
                          className="w-full text-left px-3 py-2 hover:bg-sky-50 border-b last:border-b-0 border-slate-100"
                        >
                          <div className="text-sm text-slate-800">{c.name}</div>
                          <div className="text-xs text-slate-500">{c.phone}{c.email ? ` · ${c.email}` : ""}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                data-testid="pos-add-guest-btn"
                onClick={() => setAddGuestOpen(true)}
                className="flex items-center gap-1.5 text-sky-600 hover:text-sky-700 font-medium text-sm"
              >
                <UserPlus className="w-4 h-4" /> Add Guest
              </button>
              <select
                data-testid="pos-staff-select"
                value={staffId}
                onChange={e => setStaffId(e.target.value)}
                className="ml-auto py-2 px-3 rounded-lg bg-white border border-slate-200 text-sm"
              >
                <option value="">— Default Stylist —</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {customerId && customer && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700" data-testid="pos-guest-chip">
                <UserPlus className="w-3 h-3" /> {customer.name} · {customer.phone}
              </div>
            )}

            {!customerId && cart.length > 0 && (
              <p className="text-red-500 text-xs mt-2" data-testid="pos-guest-warning">Please select guest</p>
            )}
          </div>

          {/* Items table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-3 py-3 font-medium">Staff</th>
                    <th className="text-left px-3 py-3 font-medium">Qty</th>
                    <th className="text-right px-3 py-3 font-medium">Price</th>
                    <th className="text-right px-3 py-3 font-medium">Sub Total</th>
                    <th className="text-right px-3 py-3 font-medium">Disc%</th>
                    {taxEnabled && <th className="text-right px-3 py-3 font-medium">Tax</th>}
                    <th className="text-right px-3 py-3 font-medium">Total</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((c, i) => {
                    const sub = c.qty * c.price;
                    const disc = sub * ((c.disc_pct || 0) / 100);
                    const lineTaxable = sub - disc;
                    const lineTax = lineTaxable * taxPct / 100;
                    return (
                      <tr key={`${c.type}:${c.ref_id}`} className="border-t border-slate-100" data-testid={`cart-line-${i}`}>
                        <td className="px-4 py-3 text-slate-800">{c.name}</td>
                        <td className="px-3 py-3">
                          <select
                            data-testid={`cart-line-staff-${i}`}
                            value={c.staff_id || ""}
                            onChange={e => setLineStaff(i, e.target.value)}
                            className="text-slate-800 text-xs py-1 px-2 rounded bg-slate-50 border border-slate-200 min-w-[110px]"
                          >
                            <option value="">— Stylist —</option>
                            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-md">
                            <button onClick={() => updateLine(i, { qty: Math.max(1, c.qty - 1) })} className="px-2 py-1 text-slate-500 hover:text-slate-800">−</button>
                            <span className="px-2 text-sm text-slate-800 min-w-[20px] text-center">{c.qty}</span>
                            <button onClick={() => updateLine(i, { qty: c.qty + 1 })} className="px-2 py-1 text-slate-500 hover:text-slate-800">+</button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-700">₹{c.price.toFixed(0)}</td>
                        <td className="px-3 py-3 text-right text-slate-700">₹{sub.toFixed(0)}</td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number" min="0" max="100"
                            data-testid={`cart-line-disc-${i}`}
                            value={c.disc_pct || 0}
                            onChange={e => updateLine(i, { disc_pct: Math.min(100, Math.max(0, Number(e.target.value || 0))) })}
                            className="w-14 text-right py-1 px-2 rounded bg-slate-50 border border-slate-200 text-xs"
                          />
                        </td>
                        {taxEnabled && <td className="px-3 py-3 text-right text-slate-500">₹{lineTax.toFixed(0)}</td>}
                        <td className="px-3 py-3 text-right font-semibold text-slate-800">₹{(lineTaxable + lineTax).toFixed(0)}</td>
                        <td className="px-3 py-3 text-right">
                          <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500" data-testid={`cart-line-remove-${i}`}>
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {cart.length === 0 && (
                    <tr><td colSpan={taxEnabled ? 9 : 8} className="text-center text-slate-400 py-10 text-sm">Tap a service or product on the left to add it</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-end gap-6 text-sm text-slate-600">
              <span>Discount: <span className="font-semibold text-slate-800">₹{totalDiscount.toFixed(0)}</span></span>
              {taxEnabled && (
                <span>Tax ({taxPct}%): <span className="font-semibold text-slate-800">₹{tax.toFixed(0)}</span></span>
              )}
              <span className="text-base">
                Grand Total: <span className="font-bold text-slate-900 text-lg ml-1">₹{total.toFixed(0)}</span>
              </span>
            </div>
          </div>

          {/* Order instruction + payment */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
              <label className="text-xs text-slate-500 uppercase tracking-wider font-medium">Add Order Instruction (Optional, Max 500 Characters)</label>
              <textarea
                data-testid="pos-order-notes"
                rows="3"
                maxLength={500}
                value={orderNotes}
                onChange={e => setOrderNotes(e.target.value)}
                className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="Anything we should remember for this guest…"
              />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Payment Details</div>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_MODES.map(p => (
                  <button
                    key={p.k}
                    data-testid={`pos-pay-${p.k}`}
                    onClick={() => setPayment(p.k)}
                    className={`py-2 rounded-lg text-xs font-medium border transition ${
                      payment === p.k
                        ? "bg-sky-50 border-sky-400 text-sky-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-sky-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              data-testid="pos-clear-btn"
              onClick={clearAll}
              className="px-6 py-2.5 rounded-lg bg-sky-100 border border-sky-200 text-sky-700 font-medium text-sm hover:bg-sky-200 transition"
            >
              Clear
            </button>
            <button
              data-testid="pos-create-btn"
              onClick={() => checkout(false)}
              className="px-6 py-2.5 rounded-lg bg-sky-400 text-white font-medium text-sm hover:bg-sky-500 shadow-sm transition"
            >
              Create
            </button>
            <button
              data-testid="pos-create-complete-btn"
              onClick={() => checkout(true)}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white font-semibold text-sm hover:from-sky-600 hover:to-blue-600 shadow-md transition flex items-center gap-2"
            >
              <Receipt className="w-4 h-4" /> Create & Complete
            </button>
          </div>
        </div>
      </div>

      {/* Add Guest modal */}
      {addGuestOpen && (
        <AddGuestModal
          onClose={() => setAddGuestOpen(false)}
          onCreated={(newCust) => {
            setCustomers(prev => [newCust, ...prev]);
            setCustomerId(newCust.id);
            setGuestQuery(`${newCust.name} · ${newCust.phone}`);
            setGuestOpen(false);
            setAddGuestOpen(false);
            toast.success(`Added ${newCust.name}`);
          }}
        />
      )}

      {/* Invoice receipt modal */}
      {lastInvoice && (
        <InvoiceReceiptModal
          invoice={lastInvoice}
          onClose={() => setLastInvoice(null)}
          onPrint={() => printInvoice(lastInvoice)}
          onShare={() => shareInvoiceWhatsApp(lastInvoice)}
        />
      )}
    </div>
  );
}

function AddGuestModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (!name.trim() || !/^\d{7,15}$/.test(phone.replace(/\D/g, ""))) {
      toast.error("Name and a valid phone are required");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/customers", {
        name: name.trim(),
        phone: phone.replace(/\D/g, ""),
        email: email.trim() || null,
      });
      onCreated(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't create guest");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()} data-testid="add-guest-modal">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><UserPlus className="w-5 h-5 text-sky-500" /> Add Guest</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="add-guest-close-btn"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500">Add a new walk-in customer. Their personal referral code is generated automatically.</p>
        <div>
          <label className="text-xs text-slate-500 font-medium">Name *</label>
          <input data-testid="add-guest-name" value={name} onChange={e => setName(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="Full name" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Phone *</label>
          <input data-testid="add-guest-phone" value={phone} onChange={e => setPhone(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="98765 43210" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Email (optional)</label>
          <input data-testid="add-guest-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="you@example.com" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button
            type="submit"
            data-testid="add-guest-save-btn"
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold disabled:opacity-60"
          >{busy ? "Saving…" : "Save Guest"}</button>
        </div>
      </form>
    </div>
  );
}

function InvoiceReceiptModal({ invoice, onClose, onPrint, onShare }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()} data-testid="invoice-receipt">
        <div className="text-center pb-4 border-b border-slate-100">
          <h3 className="text-2xl font-playfair text-sky-600">Miracurl ✦</h3>
          <p className="text-xs text-slate-500">Unisex Family Salon, Marathahalli</p>
          <p className="text-[10px] text-slate-400 mt-1">{new Date(invoice.created_at).toLocaleString()}</p>
        </div>
        <div className="py-4 space-y-2 text-sm">
          <Row label="Invoice #" value={<span className="font-mono">{invoice.invoice_no}</span>} />
          <Row label="Customer" value={invoice.customer_name} />
          {invoice.staff_name && <Row label="Stylist" value={invoice.staff_name} />}
          <Row label="Payment" value={<span className="uppercase text-sky-600">{invoice.payment_mode}</span>} />
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

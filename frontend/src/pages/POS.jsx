import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { Search, X, UserPlus, Receipt, Calendar, MapPin } from "lucide-react";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/share";
import { useAuth } from "@/context/AuthContext";

const PAYMENT_MODES = [
  { k: "cash", label: "Cash" },
  { k: "card", label: "Card" },
  { k: "upi", label: "GPay" },
  { k: "wallet", label: "Phone Pay" },
];

const TAB_BUTTONS = [
  { k: "services", label: "Add Service", live: true },
  { k: "products", label: "Add Product", live: true },
  { k: "package", label: "Add Package", live: true },
  { k: "giftcard", label: "Add GiftCard", live: false },
  { k: "membership", label: "Add Membership", live: true },
];

import { printInvoice } from "@/components/pos/receipt";
import AddGuestModal from "@/components/pos/AddGuestModal";
import InvoiceReceiptModal from "@/components/pos/InvoiceReceiptModal";


export default function POS() {
  const { tenant } = useAuth();
  const [mode, setMode] = useState("services"); // services | products
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [packages, setPackages] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [benefits, setBenefits] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [couponInfo, setCouponInfo] = useState(null);
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
  const [branchId, setBranchId] = useState(() => {
    try { return localStorage.getItem("pos_branch") || ""; } catch { return ""; }
  });
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
    api.get("/packages").then(r => setPackages(r.data.filter(p => p.active))).catch(() => {});
    api.get("/memberships").then(r => setMemberships(r.data.filter(m => m.active))).catch(() => {});
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

  // Load guest benefits (loyalty, packages, membership) when a guest is selected
  useEffect(() => {
    setBenefits(null); setRedeemPoints(0);
    if (!customerId) return;
    api.get(`/customers/${customerId}/benefits`).then(r => setBenefits(r.data)).catch(() => {});
  }, [customerId]);

  const catalog = useMemo(() => (
    mode === "services" ? services
    : mode === "products" ? products
    : mode === "package" ? packages
    : mode === "membership" ? memberships : []
  ), [mode, services, products, packages, memberships]);
  const categories = useMemo(
    () => (mode === "services" || mode === "products") ? [...new Set(catalog.map(i => i.category || "Other"))] : [],
    [catalog, mode]);

  // Reset selected category when switching mode
  useEffect(() => {
    if (categories.length && !categories.includes(category)) setCategory(categories[0]);
  }, [categories, category]);

  const filtered = useMemo(() => catalog.filter(i =>
    (!categories.length || !category || (i.category || "Other") === category) &&
    (!q || i.name.toLowerCase().includes(q.toLowerCase())),
  ), [catalog, categories, category, q]);

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
    const type = mode === "services" ? "service" : mode === "products" ? "product"
      : mode === "package" ? "package" : "membership";
    if (type === "package" || type === "membership") {
      if (cart.some(c => c.type === type && c.ref_id === it.id)) { toast.info("Already in the bill"); return; }
      setCart([...cart, { type, ref_id: it.id, name: it.name, qty: 1, price: it.price, disc_pct: 0, staff_id: "", staff_name: "" }]);
      return;
    }
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
  const servicesSubtotal = useMemo(() => cart.filter(c => c.type === "service").reduce((s, c) => s + c.qty * c.price, 0), [cart]);
  const membershipDiscount = benefits?.membership ? servicesSubtotal * benefits.membership.discount_pct / 100 : 0;
  const afterMemb = Math.max(0, subtotal - lineDiscount - membershipDiscount);
  const couponDiscount = couponInfo ? (couponInfo.type === "percent" ? afterMemb * couponInfo.value / 100 : Math.min(couponInfo.value, afterMemb)) : 0;
  const loyaltyRules = benefits?.loyalty_rules || {};
  const redeemCap = Number(loyaltyRules.max_redeem_per_visit) > 0 ? Number(loyaltyRules.max_redeem_per_visit) : Infinity;
  const canRedeem = subtotal >= Number(loyaltyRules.min_bill_to_redeem || 0);
  const pointsUsed = canRedeem ? Math.min(redeemPoints || 0, benefits?.loyalty_points || 0, redeemCap, Math.max(0, afterMemb - couponDiscount)) : 0;
  const totalDiscount = lineDiscount + membershipDiscount + couponDiscount + pointsUsed;
  const taxable = Math.max(0, subtotal - totalDiscount);
  const tax = taxable * taxPct / 100;
  const total = taxable + tax;

  async function checkCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponInfo(null); return; }
    try {
      const { data } = await api.get(`/coupons`);
      const c = data.find(x => x.code === code && x.active);
      if (!c) { setCouponInfo(null); toast.error("Invalid coupon code"); return; }
      setCouponInfo({ code: c.code, type: c.type, value: c.value });
      toast.success(`Coupon ${c.code} applied ✦`);
    } catch { toast.error("Couldn't check coupon"); }
  }

  function clearAll() {
    setCart([]); setOrderNotes(""); setStaffId("");
    setCustomerId(""); setGuestQuery(""); setGuestOpen(false); setPayment("cash");
    setRedeemPoints(0); setCouponCode(""); setCouponInfo(null);
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
        discount: lineDiscount,
        tax_pct: taxPct,
        payment_mode: payment,
        redeem_points: pointsUsed,
        coupon_code: couponInfo?.code || null,
        branch_id: branchId || null,
      });
      toast.success(`Invoice ${data.invoice_no} created${data.points_earned ? ` · +${data.points_earned} pts earned` : ""}`);
      setLastInvoice(data);
      if (complete) clearAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Checkout failed"); }
  }

  function shareInvoiceWhatsApp(inv) {
    const brandName = tenant?.name || "Your Salon";
    const cust = customers.find(c => c.id === inv.customer_id);
    const phone = cust?.phone?.replace(/\D/g, "") || "";
    const itemLines = inv.items.map(it => {
      const staffPart = it.staff_name ? ` (by ${it.staff_name})` : "";
      return `• ${it.name} × ${it.qty}${staffPart} — ₹${(it.qty * it.price).toFixed(0)}`;
    }).join("\n");
    const msg = [
      `*${brandName} ✦* Receipt`,
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
      `Thank you for visiting ${brandName} ✦`,
    ].filter(Boolean).join("\n");
    openWhatsApp(msg, phone);
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800" data-testid="pos-page">
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
                className={`rounded-xl py-4 px-2 text-xs font-semibold uppercase tracking-wide truncate border transition shadow-sm ${
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
            <h3 className="text-base font-semibold text-slate-700 mb-3">
              {(() => {
                if (categories.length) return category || "All items";
                if (mode === "package") return "Packages";
                if (mode === "membership") return "Memberships";
                return "All items";
              })()}
            </h3>
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
              <div className="flex items-center gap-3">
                {(tenant?.branches || []).length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-sky-500" />
                    <select
                      data-testid="pos-branch-select"
                      value={branchId}
                      onChange={e => { setBranchId(e.target.value); try { localStorage.setItem("pos_branch", e.target.value); } catch { /* noop */ } }}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 max-w-[220px]"
                      title="Bills are tagged to this branch for per-branch collection reports"
                    >
                      <option value="">Main — {tenant?.location || "primary location"}</option>
                      {tenant.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-1 text-sm text-slate-500">
                  <Calendar className="w-4 h-4" />
                  {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
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

            {/* Guest benefits: loyalty points, membership, prepaid packages */}
            {customerId && benefits && (
              <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="pos-benefits-panel">
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium" data-testid="pos-loyalty-chip">
                  🪙 {benefits.loyalty_points} pts (₹{benefits.loyalty_points})
                </span>
                {benefits.loyalty_points > 0 && (
                  canRedeem ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                      Redeem
                      <input type="number" min="0" max={Math.min(benefits.loyalty_points, redeemCap)} value={redeemPoints || ""}
                        data-testid="pos-redeem-points-input"
                        onChange={e => setRedeemPoints(Math.min(Math.min(benefits.loyalty_points, redeemCap), Math.max(0, parseInt(e.target.value || 0))))}
                        className="w-20 px-2 py-1 rounded border border-slate-200 bg-white text-xs" placeholder="0" /> pts
                      {Number.isFinite(redeemCap) && <span className="text-[10px] text-slate-400">(max {redeemCap}/visit)</span>}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400" data-testid="pos-redeem-locked">
                      🔒 Points redeemable on bills of ₹{Number(loyaltyRules.min_bill_to_redeem || 0).toLocaleString("en-IN")}+
                    </span>
                  )
                )}
                {benefits.birthday_week && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-700 font-medium" data-testid="pos-birthday-chip">
                    🎂 Birthday week — treat them with a special discount!
                  </span>
                )}
                {benefits.anniversary_week && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-medium" data-testid="pos-anniversary-chip">
                    💞 Anniversary week — a little extra off goes a long way!
                  </span>
                )}
                {benefits.membership && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-medium" data-testid="pos-membership-chip">
                    👑 {benefits.membership.name} · {benefits.membership.discount_pct}% off services
                  </span>
                )}
                {benefits.packages.map(p => (
                  <button key={p.id} type="button" data-testid={`pos-package-redeem-${p.id}`}
                    onClick={() => {
                      if (cart.some(c => c.type === "package_redeem" && c.ref_id === p.id)) { toast.info("Session already added"); return; }
                      setCart(prev => [...prev, { type: "package_redeem", ref_id: p.id, name: `${p.service_name} (package session)`, qty: 1, price: 0, disc_pct: 0, staff_id: "", staff_name: "" }]);
                      toast.success(`Session from '${p.package_name}' added at ₹0`);
                    }}
                    className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium hover:bg-emerald-100">
                    📦 {p.package_name}: {p.sessions_left} left — Use session
                  </button>
                ))}
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
            <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <input
                  data-testid="pos-coupon-input"
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponInfo(null); }}
                  onKeyDown={e => e.key === "Enter" && checkCoupon()}
                  placeholder="Coupon code"
                  className="w-28 px-2 py-1 rounded border border-slate-200 bg-slate-50 text-xs font-mono uppercase"
                />
                <button type="button" data-testid="pos-coupon-apply-btn" onClick={checkCoupon} className="text-xs text-sky-600 font-medium hover:underline">Apply</button>
              </span>
              {membershipDiscount > 0 && <span className="text-violet-600" data-testid="pos-membership-discount">👑 −₹{membershipDiscount.toFixed(0)}</span>}
              {couponDiscount > 0 && <span className="text-emerald-600" data-testid="pos-coupon-discount">🎟 {couponInfo.code} −₹{couponDiscount.toFixed(0)}</span>}
              {pointsUsed > 0 && <span className="text-amber-600" data-testid="pos-points-discount">🪙 −₹{pointsUsed.toFixed(0)}</span>}
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
          tenant={tenant}
          onClose={() => setLastInvoice(null)}
          onPrint={() => printInvoice(lastInvoice, tenant)}
          onShare={() => shareInvoiceWhatsApp(lastInvoice)}
        />
      )}
    </div>
  );
}


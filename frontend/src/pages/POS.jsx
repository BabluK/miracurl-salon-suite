import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/share";
import { payLabel } from "@/components/pos/payLabels";
import { useAuth } from "@/context/AuthContext";
import { printInvoice } from "@/components/pos/receipt";
import AddGuestModal from "@/components/pos/AddGuestModal";
import InvoiceReceiptModal from "@/components/pos/InvoiceReceiptModal";
import { POSHeader } from "@/components/pos/POSHeader";
import { CatalogPanel } from "@/components/pos/CatalogPanel";
import { InvoiceHeader } from "@/components/pos/InvoiceHeader";
import { CartTable } from "@/components/pos/CartTable";
import { PaymentSection } from "@/components/pos/PaymentSection";

const ITEM_TYPE_BY_MODE = { services: "service", products: "product", package: "package", membership: "membership" };

export default function POS() {
  const { tenant } = useAuth();
  const [mode, setMode] = useState("services"); // services | products | package | membership
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
    api.get("/products").then(r => setProducts(r.data.filter(p => (p.product_type || "retail") !== "in_house")));
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

  const catalog = useMemo(() => {
    const byMode = { services, products, package: packages, membership: memberships };
    return byMode[mode] || [];
  }, [mode, services, products, packages, memberships]);
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
    const query = guestQuery.trim().toLowerCase();
    if (!query) return [];
    return customers.filter(c => {
      const name = (c.name || "").toLowerCase();
      const phone = String(c.phone || "").toLowerCase();
      return name.includes(query) || phone.includes(query);
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
  function changeBranch(id) {
    setBranchId(id);
    try { localStorage.setItem("pos_branch", id); } catch { /* private mode */ }
  }

  function addToCart(it) {
    const type = ITEM_TYPE_BY_MODE[mode];
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
  function redeemPackage(p) {
    if (cart.some(c => c.type === "package_redeem" && c.ref_id === p.id)) { toast.info("Session already added"); return; }
    setCart(prev => [...prev, { type: "package_redeem", ref_id: p.id, name: `${p.service_name} (package session)`, qty: 1, price: 0, disc_pct: 0, staff_id: "", staff_name: "" }]);
    toast.success(`Session from '${p.package_name}' added at ₹0`);
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
      const rc = data.receipts || {};
      if (rc.email?.sent) toast.info("📧 Receipt emailed to the guest");
      if (rc.sms?.sent) toast.info(`📱 SMS receipt sent · ${rc.sms.points_left} SMS points left`);
      if (rc.whatsapp_url) {
        toast.success("💬 Send the receipt + review link on WhatsApp?", {
          duration: 12000,
          action: { label: "Open WhatsApp", onClick: () => window.open(rc.whatsapp_url, "_blank") },
        });
      }
      else if (rc.sms?.error === "no_sms_points") toast.warning("SMS receipt skipped — no SMS points left. Ask HQ to recharge.");
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
      `Paid via ${payLabel(inv.payment_mode)}`,
      "",
      `Thank you for visiting ${brandName} ✦`,
    ].filter(Boolean).join("\n");
    openWhatsApp(msg, phone);
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800" data-testid="pos-page">
      <POSHeader q={q} setQ={setQ} mode={mode} setMode={setMode} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <CatalogPanel
          mode={mode} categories={categories} category={category}
          setCategory={setCategory} filtered={filtered} onAdd={addToCart}
        />

        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <InvoiceHeader
            tenant={tenant} branchId={branchId} onBranchChange={changeBranch}
            guestBoxRef={guestBoxRef} guestQuery={guestQuery} setGuestQuery={setGuestQuery}
            customerId={customerId} setCustomerId={setCustomerId}
            guestOpen={guestOpen} setGuestOpen={setGuestOpen} guestMatches={guestMatches}
            selectGuest={selectGuest} clearGuest={clearGuest} onAddGuest={() => setAddGuestOpen(true)}
            staff={staff} staffId={staffId} setStaffId={setStaffId}
            customer={customer} cartHasItems={cart.length > 0}
            benefits={benefits} canRedeem={canRedeem} redeemCap={redeemCap}
            redeemPoints={redeemPoints} setRedeemPoints={setRedeemPoints}
            loyaltyRules={loyaltyRules} onRedeemPackage={redeemPackage}
          />

          <CartTable
            cart={cart} staff={staff} taxEnabled={taxEnabled} taxPct={taxPct}
            updateLine={updateLine} setLineStaff={setLineStaff} removeLine={removeLine}
            couponCode={couponCode} setCouponCode={setCouponCode} setCouponInfo={setCouponInfo}
            checkCoupon={checkCoupon} couponInfo={couponInfo}
            membershipDiscount={membershipDiscount} couponDiscount={couponDiscount}
            pointsUsed={pointsUsed} totalDiscount={totalDiscount} tax={tax} total={total}
          />

          <PaymentSection
            orderNotes={orderNotes} setOrderNotes={setOrderNotes}
            payment={payment} setPayment={setPayment}
            walletBalance={customers.find(c => c.id === customerId)?.wallet_balance || 0}
            onClear={clearAll} onCheckout={checkout}
          />
        </div>
      </div>

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

      {lastInvoice && (
        <InvoiceReceiptModal
          invoice={lastInvoice}
          tenant={tenant}
          customer={customers.find(c => c.id === lastInvoice.customer_id)}
          onEmailSaved={(cid, email) => setCustomers(prev => prev.map(c => (c.id === cid ? { ...c, email } : c)))}
          onClose={() => setLastInvoice(null)}
          onPrint={() => printInvoice(lastInvoice, tenant)}
          onShare={() => shareInvoiceWhatsApp(lastInvoice)}
        />
      )}
    </div>
  );
}

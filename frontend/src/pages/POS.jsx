import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/share";
import { payLabel } from "@/components/pos/payLabels";
import { useAuth } from "@/context/AuthContext";
import { printInvoice } from "@/components/pos/receipt";
import AddGuestModal from "@/components/pos/AddGuestModal";
import InvoiceReceiptModal from "@/components/pos/InvoiceReceiptModal";
import GiftCardInfoModal from "@/components/pos/GiftCardInfoModal";
import { MemberQrScanner } from "@/components/pos/MemberQrScanner";
import { GiftCardSellModal } from "@/components/pos/GiftCardSellModal";
import { OpenBillsPanel } from "@/components/pos/OpenBillsPanel";
import { PendingBillModal } from "@/components/pos/PendingBillModal";
import { DuplicateBillModal } from "@/components/pos/DuplicateBillModal";
import { playErrorBuzz } from "@/lib/scanSounds";
import { POSHeader } from "@/components/pos/POSHeader";
import { CatalogPanel } from "@/components/pos/CatalogPanel";
import { OffersPanel } from "@/components/pos/OffersPanel";
import { InvoiceHeader } from "@/components/pos/InvoiceHeader";
import { CartTable } from "@/components/pos/CartTable";
import { TipSection } from "@/components/pos/TipSection";
import { PaymentSection } from "@/components/pos/PaymentSection";
import { curSym } from "@/lib/currency";

const ITEM_TYPE_BY_MODE = { services: "service", products: "product", package: "package", membership: "membership" };

export default function POS() {
  const { tenant, user } = useAuth();
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
  const [genderFilter, setGenderFilter] = useState("all"); // all | male | female
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestOpen, setGuestOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [taxPct, setTaxPct] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [payment, setPayment] = useState("");
  const [charging, setCharging] = useState(false);
  const chargingRef = useRef(false);
  const [dupPrompt, setDupPrompt] = useState(null); // { message, complete }
  const [branchId, setBranchId] = useState(() => {
    try { return localStorage.getItem("pos_branch") || ""; } catch { return ""; }
  });
  const [lastInvoice, setLastInvoice] = useState(null);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [tipPct, setTipPct] = useState(null);
  const [customTip, setCustomTip] = useState(0);
  const [tipStaffId, setTipStaffId] = useState("");
  const [gcCode, setGcCode] = useState("");
  const [memberCode, setMemberCode] = useState("");
  const [memberInfo, setMemberInfo] = useState(null);
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [gcSellOpen, setGcSellOpen] = useState(false);
  const [openBillsKey, setOpenBillsKey] = useState(0);
  const [pendingBill, setPendingBill] = useState(null);

  function onQrDetected(text) {
    setQrScanOpen(false);
    const up = String(text || "").toUpperCase();
    const mc = up.match(/MC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    const gc = up.match(/GC-[A-Z0-9-]{4,}/);
    if (mc) { setMemberCode(mc[0]); applyMemberCode(mc[0]); return; }
    if (gc) { setGcCode(gc[0]); checkGiftCard(gc[0]); return; }
    playErrorBuzz();
    toast.error("That QR isn't a Miracurl member or gift card");
  }

  // Draft persistence: refresh/new tab must not lose an in-progress bill
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem("pos_draft") || "null");
      if (d?.cart?.length) {
        setCart(d.cart); setCustomerId(d.customerId || ""); setGuestQuery(d.guestQuery || "");
        setOrderNotes(d.orderNotes || ""); if (d.payment) setPayment(d.payment);
        setPendingBill({
          items: d.cart.reduce((s, c) => s + (c.qty || 1), 0),
          total: d.cart.reduce((s, c) => s + (c.qty || 1) * (c.price || 0), 0),
        });
      }
    } catch { /* fresh start */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (cart.length) {
      localStorage.setItem("pos_draft", JSON.stringify({ cart, customerId, guestQuery, orderNotes, payment }));
    } else {
      localStorage.removeItem("pos_draft");
    }
  }, [cart, customerId, guestQuery, orderNotes, payment]);

  async function applyMemberCode(codeArg) {
    const code = String(codeArg || memberCode).trim().toUpperCase().replace(/\s+/g, "");
    if (!/^MC-/.test(code)) { toast.error("Member IDs start with MC- (e.g. MC-A7F9-K2T8-X4Q1)"); return; }
    try {
      const { data } = await api.get(`/pos/member-lookup/${encodeURIComponent(code)}`);
      setMemberInfo(data);
      selectGuest(data.customer);
      if (data.membership.status === "active") {
        toast.success(`👑 ${data.membership.tier.toUpperCase()} member — ${data.customer.name} pulled up. ${data.membership.discount_pct}% off applies automatically.`);
      } else {
        playErrorBuzz();
        const expDate = new Date(data.membership.expires_at).toLocaleDateString("en-IN");
        const renewUrl = `${window.location.origin}/membership/${tenant?.slug}?renew=${data.membership.member_id}`;
        const phone = String(data.customer.phone || "").replace(/\D/g, "");
        const waText = encodeURIComponent(
          `Hi ${data.customer.name}! 💛 Your ${(data.membership.tier || "").toUpperCase()} membership at ${tenant?.name || "our salon"} expired on ${expDate}. Renew in one tap and keep enjoying your member discounts, wallet cashback & priority booking: ${renewUrl}`
        );
        toast.warning(`${data.customer.name} — membership EXPIRED on ${expDate}`, {
          duration: 15000,
          description: "Send them a one-tap renew link 👇",
          action: {
            label: phone ? "📲 WhatsApp renew link" : "📋 Copy renew link",
            onClick: () => {
              if (phone) {
                window.open(`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${waText}`, "_blank");
              } else {
                navigator.clipboard?.writeText(renewUrl);
                toast.success("Renew link copied — send it to them anywhere");
              }
            },
          },
        });
      }
    } catch (e) {
      setMemberInfo(null);
      playErrorBuzz();
      toast.error(e.response?.data?.detail || "No member with this ID at your salon");
    }
  }
  const [gcInfo, setGcInfo] = useState(null);
  const [gcModalOpen, setGcModalOpen] = useState(false);
  const [posOffers, setPosOffers] = useState({ mira_packages: [], day_offers: [] });
  const [offerApplied, setOfferApplied] = useState(null);
  const [overallDisc, setOverallDisc] = useState(0);
  const [overallDiscMode, setOverallDiscMode] = useState("amt");
  const guestBoxRef = useRef(null);
  const sym = curSym(tenant);
  const lockedBranchId = (user?.role === "manager" && user?.branch)
    ? (user.branch === "__main__" ? "" : ((tenant?.branches || []).find(b => b.name === user.branch)?.id || null))
    : null;

  useEffect(() => {
    if (lockedBranchId !== null && branchId !== lockedBranchId) {
      setBranchId(lockedBranchId);
      try { localStorage.setItem("pos_branch", lockedBranchId); } catch { /* private mode */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedBranchId]);

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
    api.get("/pos/offers").then(r => setPosOffers(r.data)).catch(() => {});
    api.get("/staff").then(r => setStaff(r.data.filter(s => !s.away)));
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

  const filtered = useMemo(() => {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const tokens = norm(q).split(" ").filter(Boolean);
    // typed search: every word must appear somewhere in name+category, across ALL categories
    if (tokens.length) {
      return catalog.filter(i => {
        const hay = norm(`${i.name} ${i.category || ""}`);
        return tokens.every(tk => hay.includes(tk));
      });
    }
    return catalog.filter(i =>
      (!categories.length || !category || (i.category || "Other") === category) &&
      (mode !== "services" || genderFilter === "all" ||
        (i.gender || "unisex") === genderFilter || (i.gender || "unisex") === "unisex"),
    );
  }, [catalog, categories, category, q, mode, genderFilter]);

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

  // Member ID lookup: typing/scanning MC-XXXX… pulls the guest up instantly
  useEffect(() => {
    const q = guestQuery.trim().toUpperCase().replace(/\s+/g, "");
    if (customerId || !/^MC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(q)) return;
    const timer = setTimeout(() => {
      api.get(`/pos/member-lookup/${encodeURIComponent(q)}`)
        .then(r => {
          selectGuest(r.data.customer);
          const m = r.data.membership;
          if (m.status === "active") {
            toast.success(`💳 ${(m.tier || "").toUpperCase()} member — ${r.data.customer.name} · ${m.discount_pct}% off + ${m.cashback_pct}% cashback`);
          } else {
            toast.warning(`💳 ${r.data.customer.name} found — membership EXPIRED on ${new Date(m.expires_at).toLocaleDateString("en-IN")}. Offer a renewal!`);
          }
        })
        .catch(() => toast.error("No member with this ID at your salon"));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestQuery, customerId]);
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
    toast.success(`Session from '${p.package_name}' added at ${sym}0`);
  }
  function addMiraPackage(p) {
    if (cart.some(c => c.type === "mira_package" && c.ref_id === p.id)) { toast.info("Package already in the bill"); return; }
    setCart(prev => [...prev, {
      type: "mira_package", ref_id: p.id, name: `${p.name} (package)`,
      qty: 1, price: Number(p.package_price), disc_pct: 0, staff_id: "", staff_name: "",
    }]);
    toast.success(`🎀 '${p.name}' added at ${sym}${Number(p.package_price).toFixed(0)}`);
  }
  function applyOffer(o) {
    setOfferApplied({ id: o.id, title: o.title, pct: Number(o.discount_pct) });
    toast.success(`🔥 '${o.title}' — ${o.discount_pct}% off applied to this bill`);
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
  const offerDiscount = offerApplied ? Math.max(0, (afterMemb - couponDiscount)) * offerApplied.pct / 100 : 0;
  const overallBase = Math.max(0, afterMemb - couponDiscount - offerDiscount);
  const overallDiscount = Math.min(
    overallDiscMode === "pct"
      ? overallBase * Math.min(Math.max(0, Number(overallDisc) || 0), 100) / 100
      : Math.max(0, Number(overallDisc) || 0),
    overallBase);
  const loyaltyRules = benefits?.loyalty_rules || {};
  const redeemCap = Number(loyaltyRules.max_redeem_per_visit) > 0 ? Number(loyaltyRules.max_redeem_per_visit) : Infinity;
  const canRedeem = subtotal >= Number(loyaltyRules.min_bill_to_redeem || 0);
  const pointsUsed = canRedeem ? Math.min(redeemPoints || 0, benefits?.loyalty_points || 0, redeemCap, Math.max(0, afterMemb - couponDiscount - offerDiscount - overallDiscount)) : 0;
  const totalDiscount = lineDiscount + membershipDiscount + couponDiscount + offerDiscount + overallDiscount + pointsUsed;
  const taxable = Math.max(0, subtotal - totalDiscount);
  const tax = taxable * taxPct / 100;
  const total = taxable + tax;
  const tipAmount = tipPct != null ? Math.round(taxable * tipPct) / 100 : Number(customTip || 0);
  const giftApplied = gcInfo ? Math.min(gcInfo.balance, total) : 0;
  const grandTotal = total + tipAmount;
  const dueAfterGift = Math.max(0, grandTotal - giftApplied);
  const [walletApply, setWalletApply] = useState(0);

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

  async function checkGiftCard(codeArg) {
    const code = String(codeArg || gcCode).trim().toUpperCase();
    if (!code) { setGcInfo(null); return; }
    try {
      const { data } = await api.post("/gift-cards/check", { code });
      if (!data.valid) { setGcInfo(null); playErrorBuzz(); toast.error(data.reason || "Invalid gift card"); return; }
      setGcInfo(data);
      setGcModalOpen(true);
      const willApply = Math.min(data.balance, total);
      if (total <= 0) {
        toast.info(`Gift card valid — balance ${sym}${Number(data.balance).toFixed(0)}. Add items to the bill to apply it.`);
      } else if (data.balance < total) {
        toast.warning(`Low balance — card covers ${sym}${willApply.toFixed(0)}, ${sym}${(total - data.balance).toFixed(0)} still due`);
      } else {
        toast.success(`Gift card 🎁 ${sym}${willApply.toFixed(0)} will be applied · ${sym}${(data.balance - willApply).toFixed(0)} left after this bill`);
      }
    } catch { playErrorBuzz(); toast.error("Couldn't check the gift card"); }
  }

  function clearAll() {
    setCart([]); setOrderNotes(""); setStaffId("");
    setCustomerId(""); setGuestQuery(""); setGuestOpen(false); setPayment("");
    setRedeemPoints(0); setCouponCode(""); setCouponInfo(null);
    setOfferApplied(null); setOverallDisc(0); setOverallDiscMode("amt");
    setGcCode(""); setGcInfo(null); setWalletApply(0); setMemberCode(""); setMemberInfo(null);
    setTipPct(null); setCustomTip(0); setTipStaffId("");
  }

  async function checkout(complete = true, forceDup = false) {
    if (chargingRef.current) return;
    const missingStaff = cart.filter(c => c.type === "service" && !c.staff_id);
    if (missingStaff.length > 0) {
      toast.error(`Select the stylist who did: ${missingStaff.map(m => m.name).join(", ")}`);
      return;
    }
    if (!customerId) { toast.error("Please select a guest"); return; }
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (!payment) { toast.error("Select the payment mode first"); return; }
    chargingRef.current = true;
    setCharging(true);
    try {
      const { data } = await api.post("/invoices", {
        customer_id: customerId,
        staff_id: staffId || null,
        items: cart.map(({ type, ref_id, name, qty, price, staff_id, staff_name, gift_meta }) => ({
          type, ref_id, name, qty, price,
          staff_id: staff_id || null, staff_name: staff_name || null,
          gift_meta: gift_meta || null,
        })),
        discount: lineDiscount + offerDiscount + overallDiscount,
        tax_pct: taxPct,
        payment_mode: payment,
        redeem_points: pointsUsed,
        coupon_code: couponInfo?.code || null,
        tip_amount: tipAmount,
        tip_staff_id: tipStaffId || staffId || null,
        gift_card_code: gcInfo ? gcCode.trim().toUpperCase() : null,
        wallet_apply: payment === "salon_wallet" ? 0 : Math.min(walletApply, dueAfterGift),
        status: complete ? "completed" : "open",
        branch_id: branchId || null,
        force_duplicate: forceDup,
      });
      if (!complete) {
        toast.success(`Bill ${data.invoice_no} saved as OPEN 📋 — complete it anytime from the "Open bills" panel above`);
        setOpenBillsKey(k => k + 1);
        setLastInvoice(data);
        clearAll();
        return;
      }
      toast.success(`Invoice ${data.invoice_no} created${data.points_earned ? ` · +${data.points_earned} pts earned` : ""}`);
      if (data.gift_card_applied > 0) {
        toast.success(`🎁 ${sym}${Number(data.gift_card_applied).toFixed(0)} deducted from gift card · ${sym}${Number(data.gift_card_balance_left || 0).toFixed(0)} balance left`, { duration: 8000 });
      }
      const rc = data.receipts || {};
      if (rc.email?.sent) toast.info("📧 Receipt emailed to the guest");
      if (rc.sms?.sent) toast.info(`📱 SMS receipt sent · ${rc.sms.points_left} SMS points left`);
      if (rc.whatsapp_url && user?.role !== "manager") {
        toast.success("💬 Send the receipt + review link on WhatsApp?", {
          duration: 12000,
          action: { label: "Open WhatsApp", onClick: () => window.open(rc.whatsapp_url, "_blank") },
        });
      }
      else if (rc.sms?.error === "no_sms_points") toast.warning("SMS receipt skipped — no SMS points left. Ask HQ to recharge.");
      (data.gift_cards_issued || []).forEach(g => {
        toast.success(`🎁 Gift card ${g.code} issued — ${g.recipient_name || "recipient"} (₹${Number(g.amount || 0).toLocaleString("en-IN")})`, {
          duration: 15000,
          ...(g.whatsapp_url ? { action: { label: "Send on WhatsApp", onClick: () => window.open(g.whatsapp_url, "_blank") } } : {}),
        });
      });
      setLastInvoice(data);
      if (complete) clearAll();
    } catch (err) {
      const detail = String(err.response?.data?.detail || "");
      if (err.response?.status === 409 && detail.includes("DUPLICATE_BILL")) {
        chargingRef.current = false;
        setCharging(false);
        setDupPrompt({ message: detail.replace("DUPLICATE_BILL — ", ""), complete });
        return;
      }
      toast.error(detail || "Checkout failed");
    }
    finally { chargingRef.current = false; setCharging(false); }
  }

  function shareInvoiceWhatsApp(inv) {
    const brandName = tenant?.name || "Your Salon";
    const cust = customers.find(c => c.id === inv.customer_id);
    const phone = cust?.phone?.replace(/\D/g, "") || "";
    const itemLines = inv.items.map(it => {
      const staffPart = it.staff_name ? ` (by ${it.staff_name})` : "";
      return `• ${it.name} × ${it.qty}${staffPart} — ${sym}${(it.qty * it.price).toFixed(0)}`;
    }).join("\n");
    const msg = [
      `*${brandName} ✦* Receipt`,
      `Invoice ${inv.invoice_no}`,
      `Customer: ${inv.customer_name}`,
      inv.staff_name ? `Stylist: ${inv.staff_name}` : "",
      "",
      itemLines,
      "",
      `Subtotal: ${sym}${inv.subtotal.toFixed(0)}`,
      `Discount: −${sym}${inv.discount.toFixed(0)}`,
      Number(inv.tax) > 0 ? `Tax: ${sym}${inv.tax.toFixed(0)}` : "",
      `*Total: ${sym}${inv.total.toFixed(0)}*`,
      Number(inv.tip) > 0 ? `Tip 💜: ${sym}${inv.tip.toFixed(0)}${inv.tip_staff_name ? ` (for ${inv.tip_staff_name})` : ""}` : "",
      Number(inv.tip) > 0 ? `*Total incl. tip: ${sym}${(inv.total + inv.tip).toFixed(0)}*` : "",
      `Paid via ${payLabel(inv.payment_mode)}`,
      "",
      `Thank you for visiting ${brandName} ✦`,
    ].filter(Boolean).join("\n");
    openWhatsApp(msg, phone);
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800" data-testid="pos-page">
      <POSHeader q={q} setQ={setQ} mode={mode} setMode={setMode} onGiftCard={() => setGcSellOpen(true)} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {mode === "offers" ? (
          <OffersPanel
            offers={posOffers} offerApplied={offerApplied} sym={sym} cart={cart}
            onApplyOffer={applyOffer} onRemoveOffer={() => setOfferApplied(null)}
            onAddPackage={addMiraPackage}
          />
        ) : (
        <CatalogPanel
          mode={mode} categories={categories} category={category}
          setCategory={setCategory} filtered={filtered} onAdd={addToCart}
          gender={genderFilter} setGender={setGenderFilter} q={q}
        />
        )}

        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <OpenBillsPanel sym={sym} refreshKey={openBillsKey} canDelete={user?.role === "admin"} />
          <InvoiceHeader
            tenant={tenant} branchId={branchId} onBranchChange={changeBranch} branchLocked={lockedBranchId !== null}
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
            cart={cart} staff={staff} taxEnabled={taxEnabled} taxPct={taxPct} sym={sym}
            updateLine={updateLine} setLineStaff={setLineStaff} removeLine={removeLine}
            couponCode={couponCode} setCouponCode={setCouponCode} setCouponInfo={setCouponInfo}
            checkCoupon={checkCoupon} couponInfo={couponInfo}
            offerApplied={offerApplied} offerDiscount={offerDiscount}
            overallDisc={overallDisc} setOverallDisc={setOverallDisc} overallDiscount={overallDiscount}
            overallDiscMode={overallDiscMode} setOverallDiscMode={setOverallDiscMode}
            membershipDiscount={membershipDiscount} couponDiscount={couponDiscount}
            pointsUsed={pointsUsed} totalDiscount={totalDiscount} tax={tax} total={total}
          />

          <TipSection
            sym={sym} isInr={(tenant?.currency || "INR") === "INR"}
            taxable={taxable} tipPct={tipPct} setTipPct={setTipPct}
            customTip={customTip} setCustomTip={setCustomTip} tipAmount={tipAmount}
            tipStaffId={tipStaffId} setTipStaffId={setTipStaffId} staff={staff} grandTotal={grandTotal}
          />

          <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="pos-gift-card-box">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-700">🎁 Gift card</span>
              <input value={gcCode} onChange={(e) => setGcCode(e.target.value.toUpperCase())} placeholder="GC-XXXX-XXXX"
                data-testid="pos-gift-card-input" className="w-40 font-mono text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-400" />
              <button onClick={() => checkGiftCard()} data-testid="pos-gift-card-apply"
                className="bg-fuchsia-600 text-white text-xs font-bold rounded-lg px-3 py-2 hover:bg-fuchsia-500">Apply</button>
              <button onClick={() => setQrScanOpen(true)} data-testid="pos-gift-card-scan"
                title="Scan the gift card QR with the camera"
                className="border border-fuchsia-300 text-fuchsia-600 text-xs font-bold rounded-lg px-3 py-2 hover:bg-fuchsia-50">📷 Scan</button>
              <button onClick={() => setGcSellOpen(true)} data-testid="pos-gift-card-sell"
                title="Sell a new gift card on this bill"
                className="border border-fuchsia-300 text-fuchsia-600 text-xs font-bold rounded-lg px-3 py-2 hover:bg-fuchsia-50">🎁 Sell</button>
              {gcInfo && (
                <>
                  <span className="text-xs text-emerald-600 font-semibold" data-testid="pos-gift-card-applied">
                    −{sym}{giftApplied.toFixed(0)} this bill · bal {sym}{Number(gcInfo.balance).toFixed(0)} → {sym}{Math.max(0, gcInfo.balance - giftApplied).toFixed(0)} left
                  </span>
                  <button onClick={() => setGcModalOpen(true)} data-testid="pos-gift-card-details"
                    className="text-[10px] text-fuchsia-600 font-semibold underline underline-offset-2">Details</button>
                  <button onClick={() => { setGcInfo(null); setGcCode(""); }} className="text-[10px] text-rose-500 font-semibold" data-testid="pos-gift-card-remove">Remove</button>
                  <span className="ml-auto text-sm font-bold text-slate-800">Due: {sym}{dueAfterGift.toFixed(0)}</span>
                </>
              )}
            </div>
            {gcInfo && dueAfterGift > 0 && (
              <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5" data-testid="pos-gift-card-low-note">
                ⚠ Card balance {sym}{Number(gcInfo.balance).toFixed(0)} doesn't cover the full bill — collect {sym}{dueAfterGift.toFixed(0)} via cash/card/UPI.
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-slate-100" data-testid="pos-membership-box">
              <span className="text-sm font-bold text-slate-700">💳 Membership</span>
              <input value={memberCode} onChange={(e) => setMemberCode(e.target.value.toUpperCase())} placeholder="MC-XXXX-XXXX-XXXX"
                data-testid="pos-membership-input" className="w-48 font-mono text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400" />
              <button onClick={applyMemberCode} data-testid="pos-membership-apply"
                className="bg-amber-500 text-white text-xs font-bold rounded-lg px-3 py-2 hover:bg-amber-400">Apply</button>
              <button onClick={() => setQrScanOpen(true)} data-testid="pos-membership-scan"
                title="Scan the member's QR with the camera"
                className="border border-amber-300 text-amber-600 text-xs font-bold rounded-lg px-3 py-2 hover:bg-amber-50">📷 Scan</button>
              {memberInfo && (
                <>
                  <span className={`text-xs font-semibold ${memberInfo.membership.status === "active" ? "text-emerald-600" : "text-rose-500"}`} data-testid="pos-membership-applied">
                    {memberInfo.membership.status === "active"
                      ? <>👑 {memberInfo.customer.name} · {(memberInfo.membership.tier || "").toUpperCase()} — {memberInfo.membership.discount_pct}% off auto-applied · {memberInfo.membership.cashback_pct}% cashback · wallet {sym}{Number(memberInfo.customer.wallet_balance || 0).toFixed(0)}</>
                      : <>⚠ {memberInfo.customer.name} — membership EXPIRED. Offer a renewal!</>}
                  </span>
                  <button onClick={() => { setMemberInfo(null); setMemberCode(""); }} className="text-[10px] text-rose-500 font-semibold" data-testid="pos-membership-remove">Remove</button>
                </>
              )}
            </div>
          </div>

          <PaymentSection
            orderNotes={orderNotes} setOrderNotes={setOrderNotes}
            payment={payment} setPayment={setPayment} sym={sym}
            walletBalance={customers.find(c => c.id === customerId)?.wallet_balance || 0}
            due={dueAfterGift} walletApply={walletApply} setWalletApply={setWalletApply}
            onClear={clearAll} onCheckout={checkout} charging={charging}
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

      {gcModalOpen && gcInfo && (
        <GiftCardInfoModal
          gcInfo={gcInfo} gcCode={gcCode.trim().toUpperCase()}
          giftApplied={giftApplied} dueAfterGift={dueAfterGift} sym={sym}
          onClose={() => setGcModalOpen(false)}
        />
      )}

      {qrScanOpen && <MemberQrScanner onDetected={onQrDetected} onClose={() => setQrScanOpen(false)} />}

      {gcSellOpen && (
        <GiftCardSellModal
          buyerName={customers.find(c => c.id === customerId)?.name || ""}
          onClose={() => setGcSellOpen(false)}
          onAdd={(meta, amount) => {
            setCart(c => [...c, {
              type: "gift_card", ref_id: `giftcard-${Date.now()}`,
              name: `🎁 Gift Card — ${meta.occLabel} → ${meta.recipient_name}`,
              qty: 1, price: amount, disc_pct: 0, staff_id: "", staff_name: "", gift_meta: meta,
            }]);
            setGcSellOpen(false);
            toast.success(`🎁 ₹${amount.toLocaleString("en-IN")} gift card added to the bill — code is generated once paid`);
          }}
        />
      )}

      {pendingBill && (
        <PendingBillModal
          info={pendingBill} sym={sym}
          onContinue={() => setPendingBill(null)}
          onDiscard={() => { clearAll(); setPendingBill(null); toast.info("Pending bill discarded — starting fresh"); }}
        />
      )}

      {dupPrompt && (
        <DuplicateBillModal
          message={dupPrompt.message}
          onConfirm={() => { const c = dupPrompt.complete; setDupPrompt(null); checkout(c, true); }}
          onCancel={() => { setDupPrompt(null); toast.info("Bill not created — possible duplicate avoided ✅"); }}
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
          onShare={user?.role === "manager" ? null : () => shareInvoiceWhatsApp(lastInvoice)}
        />
      )}
    </div>
  );
}

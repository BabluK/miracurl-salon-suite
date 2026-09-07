import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Scissors, Check, ArrowRight, ArrowLeft, Clock, IndianRupee, Calendar, Phone as PhoneIcon, MapPin, Star, Instagram, MessageCircle, Sparkles, Gift, CreditCard, UtensilsCrossed, ShieldCheck } from "lucide-react";
import { toast, Toaster } from "sonner";
import { FeaturedReviews, ServicesStep, StaffStep, DateTimeStep, DetailsStep, ConfirmStep, SuccessStep } from "./BookPublic.steps";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import BookingChatWidget from "@/components/BookingChatWidget";
import { HeroCTAs, GalleryShowcase, OffersShowcase, VerifiedTeam, ReferEarnBanner, AITrustStrip, LocationsSection, openMira } from "@/components/BookPublicExtras";
import { MiracurlProductsStrip } from "@/components/MiracurlProductsStrip";
import { BrandSplash } from "@/components/BrandSplash";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const DEFAULT_SLUG = "miracurl-marathahalli";
const TOASTER_STYLE = { background: '#121212', color: '#fff', border: '1px solid rgba(212,175,55,0.3)' };
const TOASTER_OPTIONS = { style: TOASTER_STYLE };
const STEP_LABELS = ["Services", "Stylist", "Date & Time", "Your Details", "Confirm"];
const RESTO_LABELS = ["Menu (optional)", "Host", "Date & Time", "Your Details", "Confirm"];
const INITIAL_FORM = { name: "", phone: "", email: "", notes: "", referral_code: "", coupon_code: "", gender: "Female" };
const localToday = () => new Date().toLocaleDateString("en-CA");

// Signature booking-page backdrops. `veil` = dark overlay strength so white text stays readable.
const BOOK_BG_IMAGES = {
  "img:aurora": { src: "/booking-bg/aurora.jpg", veil: 0.78 },
  "img:sunrise": { src: "/booking-bg/sunrise.jpg", veil: 0.78 },
  "img:salon-craft": { src: "/booking-bg/salon-craft.jpg", veil: 0.76 },
  "img:salon-blush": { src: "/booking-bg/salon-blush.jpg", veil: 0.76 },
  "img:salon-emerald": { src: "/booking-bg/salon-emerald.jpg", veil: 0.35 },
  "img:salon-noir": { src: "/booking-bg/salon-noir.jpg", veil: 0.3 },
  "img:dining-fine": { src: "/booking-bg/dining-fine.jpg", veil: 0.76 },
  "img:dining-emerald": { src: "/booking-bg/dining-emerald.jpg", veil: 0.35 },
  "img:dining-noir": { src: "/booking-bg/dining-noir.jpg", veil: 0.3 },
  "img:dining-harvest": { src: "/booking-bg/dining-harvest.jpg", veil: 0.62 },
  "img:champagne": { src: "/booking-bg/champagne-gold.jpg", veil: 0.7 },
  "img:royal-gold": { src: "/booking-bg/royal-gold.jpg", veil: 0.3 },
};

// Premium header gradients (token → CSS) — used when header_bg is a grad: token
const HEADER_GRADS = {
  "grad:pearl": "linear-gradient(135deg, #ffffff 0%, #faf3e3 55%, #f3e7c9 100%)",
  "grad:gold": "linear-gradient(135deg, #fdfbf4 0%, #f5e8c4 60%, #eeD9a4 100%)",
};

function Stepper({ step, labels = STEP_LABELS }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 mb-10 overflow-x-auto pb-2">
      {labels.map((l, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={l} className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
              done ? "bg-gold text-bg-base" :
              active ? "bg-gold/20 border-2 border-gold text-gold" :
              "bg-white/5 border border-white/10 text-white/40"
            }`}>
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs uppercase tracking-[0.2em] hidden sm:inline ${active ? "text-gold" : done ? "text-white/70" : "text-white/30"}`}>{l}</span>
            {i < labels.length - 1 && <div className={`w-6 sm:w-10 h-px ${done ? "bg-gold" : "bg-white/10"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function WalletCheck({ slug }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const [w, l] = await Promise.allSettled([
        axios.post(`${BACKEND_URL}/api/public/wallet-balance/${slug}`, { phone }),
        axios.get(`${BACKEND_URL}/api/public/loyalty/${slug}`, { params: { phone } }),
      ]);
      const wallet = w.status === "fulfilled" ? w.value.data : { found: false };
      const stamps = l.status === "fulfilled" && l.value.data?.enabled ? l.value.data : null;
      if (w.status === "rejected" && l.status === "rejected") {
        toast.error(w.reason?.response?.data?.detail || "Try again in a few minutes");
      } else {
        setResult({ ...wallet, loyalty: stamps });
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Try again in a few minutes");
    } finally { setBusy(false); }
  };

  const lo = result?.loyalty;
  return (
    <div className="mb-8 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4" data-testid="wallet-check-widget">
      {(result?.found || lo?.found) ? (
        <div className="space-y-3" data-testid="wallet-check-result">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              {result?.found ? (
                <div className="text-sm text-emerald-300 font-semibold">You have <span className="text-gold font-bold">₹{Math.round(result.balance).toLocaleString("en-IN")}</span> salon credit 💸</div>
              ) : (
                <div className="text-sm text-emerald-300 font-semibold">Your Signature Loyalty Card ✦</div>
              )}
              <div className="text-[11px] text-white/40 mt-0.5">Book below — your rewards apply when you pay at the salon ✦</div>
            </div>
            <button onClick={() => setResult(null)} className="text-[11px] text-white/40 underline">check another</button>
          </div>
          {lo?.found && (
            <div className="rounded-xl border border-gold/30 bg-gradient-to-r from-[#2a2118] to-[#1c1712] p-3" data-testid="public-stamp-card">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[11px] tracking-[0.25em] uppercase text-gold font-bold">✦ Gold Stamp Card</div>
                {lo.rewards_available > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold text-[#17141c]" data-testid="public-stamp-reward-ready">
                    🎁 {lo.reward_label} — ready! Ask at the desk
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {Array.from({ length: lo.needed }).map((_, i) => (
                  <span key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 ${i < lo.stamps ? "bg-gradient-to-br from-[#d4af37] to-[#b08d3f] border-[#f3e3ae] text-[#17141c] shadow-[0_0_10px_rgba(212,175,55,0.5)]" : "border-white/15 text-white/20"}`}>
                    {i < lo.stamps ? "✦" : "·"}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-white/50 mt-2">
                {lo.rewards_available > 0
                  ? "Your card is full — enjoy your treat on this visit! ✦"
                  : `${lo.needed - lo.stamps} more visit${lo.needed - lo.stamps === 1 ? "" : "s"} to unlock: ${lo.reward_label}`}
              </div>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={check} className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/60 font-medium shrink-0">💳 Wallet or stamp card with us?</span>
          <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" required minLength={8}
            placeholder="Your phone number" data-testid="wallet-check-phone-input"
            className="flex-1 min-w-[160px] bg-white/5 border border-white/15 rounded-full px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-300/50" />
          <button type="submit" disabled={busy} data-testid="wallet-check-btn"
            className="px-4 py-2 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold hover:bg-emerald-400/30 disabled:opacity-50">
            {busy ? "Checking…" : "Check balance"}
          </button>
          {result && !result.found && <span className="text-[11px] text-white/40 w-full" data-testid="wallet-check-notfound">No wallet found for that number — ask about our top-up plans on your next visit!</span>}
        </form>
      )}
    </div>
  );
}

const OFFER_IMGS = {
  facial: "/assets/offers/facial.jpg",
  hair: "/assets/offers/hair.jpg",
  spa: "/assets/offers/spa.jpg",
  men: "/assets/offers/men.jpg",
  dining: "/assets/offers/dining.jpg",
};
/* Festival colour themes for the hero ribbon + offer panel (falls back to house gold) */
export function festTheme(occasion = "") {
  const o = occasion.toLowerCase();
  if (/diwali|deepavali|dhanteras|lakshmi/.test(o)) return { from: "#f59e0b", to: "#b45309", glow: "rgba(245,158,11,.45)", name: "Diwali" };
  if (/holi/.test(o)) return { from: "#ec4899", to: "#3b82f6", glow: "rgba(236,72,153,.45)", name: "Holi" };
  if (/christmas|xmas/.test(o)) return { from: "#dc2626", to: "#166534", glow: "rgba(220,38,38,.45)", name: "Christmas" };
  if (/janmashtami|krishna/.test(o)) return { from: "#0d9488", to: "#1e3a8a", glow: "rgba(13,148,136,.45)", name: "Janmashtami" };
  if (/ganesh|vinayaka/.test(o)) return { from: "#f97316", to: "#dc2626", glow: "rgba(249,115,22,.45)", name: "Ganesh Chaturthi" };
  if (/eid|ramzan|ramadan/.test(o)) return { from: "#059669", to: "#065f46", glow: "rgba(5,150,105,.45)", name: "Eid" };
  if (/navratri|durga|dussehra|dasara/.test(o)) return { from: "#a21caf", to: "#f59e0b", glow: "rgba(162,28,175,.45)", name: "Navratri" };
  if (/onam|pongal|sankranti|baisakhi|ugadi/.test(o)) return { from: "#ca8a04", to: "#15803d", glow: "rgba(202,138,4,.45)", name: "Harvest" };
  if (/valentine/.test(o)) return { from: "#e11d48", to: "#be185d", glow: "rgba(225,29,72,.45)", name: "Valentine" };
  if (/new year/.test(o)) return { from: "#6366f1", to: "#d4af37", glow: "rgba(99,102,241,.45)", name: "New Year" };
  if (/women/.test(o)) return { from: "#db2777", to: "#7c3aed", glow: "rgba(219,39,119,.45)", name: "Women's Day" };
  return null;
}

function serviceImage(text, isRestaurant) {
  if (isRestaurant) return OFFER_IMGS.dining;
  const s = (text || "").toLowerCase();
  if (/\bmen|beard|shave|groom/.test(s)) return OFFER_IMGS.men;
  if (/facial|face|glow|skin|clean.?up|d.?tan|mask/.test(s)) return OFFER_IMGS.facial;
  if (/hair|cut|colou?r|keratin|botox|smooth|blow|style/.test(s)) return OFFER_IMGS.hair;
  if (/spa|massage|relax|body|pedi|mani|wax|leg/.test(s)) return OFFER_IMGS.spa;
  return OFFER_IMGS.facial;
}

function OfferCountdown({ endsAt }) {
  const [left, setLeft] = useState(() => new Date(endsAt) - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(endsAt) - Date.now()), 30000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt || left <= 0) return null;
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-400/40 text-red-300 text-[11px] font-bold" data-testid="offer-countdown">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
      Ends in {h > 0 ? `${h}h ` : ""}{m}m
    </span>
  );
}

function describeBookingError(err) {
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(x => x.msg || JSON.stringify(x)).join(" · ");
  return "Booking failed";
}

export default function BookPublic() {
  const { slug: routeSlug } = useParams();
  const slug = routeSlug || DEFAULT_SLUG;
  const PUBLIC = useMemo(() => axios.create({ baseURL: `${BACKEND_URL}/api/public` }), []);

  const [step, setStep] = useState(0);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);
  const [salon, setSalon] = useState(null);
  const [logoWide, setLogoWide] = useState(false);
  const onLogoLoad = useCallback((e) => setLogoWide(e.target.naturalWidth > e.target.naturalHeight * 1.35), []);
  const goToServices = useCallback(() => {
    setStep(0);
    setTimeout(() => {
      (document.getElementById("choose-services") || document.getElementById("booking-wizard"))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, []);
  const [services, setServices] = useState([]);
  const [dayOffer, setDayOffer] = useState(null);
  const [memberPreview, setMemberPreview] = useState(null);
  const [giftPreview, setGiftPreview] = useState(null);
  const [packages, setPackages] = useState([]);
  const [staff, setStaff] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [catImages, setCatImages] = useState({});
  const [catOrder, setCatOrder] = useState([]);
  const [busy, setBusy] = useState(false);

  const [picked, setPicked] = useState([]);
  const [staffId, setStaffId] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [seating, setSeating] = useState("any");
  const [spiceMap, setSpiceMap] = useState({});
  const [payPref, setPayPref] = useState("counter");
  const [date, setDate] = useState(localToday);
  const [time, setTime] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [referralCheck, setReferralCheck] = useState(null);
  const [couponCheck, setCouponCheck] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    if (!date) return;
    setAvailability(null);
    const staffParam = staffId ? `&staff_id=${staffId}` : "";
    PUBLIC.get(`/availability/${slug}?date=${date}${staffParam}`).then(r => setAvailability(r.data)).catch(() => setAvailability(null));
  }, [PUBLIC, slug, date, staffId]);

  const [rewards, setRewards] = useState(null);
  useEffect(() => {
    PUBLIC.get(`/salon/${slug}`).then(r => setSalon(r.data)).catch(() => setSalon({ error: true }));
    PUBLIC.get(`/rewards/${slug}`).then(r => setRewards(r.data?.eligible ? r.data : null)).catch(() => {});
    PUBLIC.get(`/gift-cards/${slug}/config`).then(r => {
      const amts = (r.data?.amounts || []).map(Number).filter(a => a > 0);
      if (r.data?.enabled !== false && amts.length) setGiftPreview({ from: Math.min(...amts), validity: r.data?.validity_days || 0 });
    }).catch(() => {});
    PUBLIC.get(`/membership/${slug}/config`).then(r => {
      const plans = (r.data?.plans || []).filter(p => !p.custom && Number(p.price) > 0);
      if (plans.length) setMemberPreview({
        from: Math.min(...plans.map(p => Number(p.price))),
        cashback: Math.max(...plans.map(p => Number(p.cashback_pct) || 0)),
        discount: Math.max(...plans.map(p => Number(p.discount_pct) || 0)),
        tiers: plans.length,
      });
    }).catch(() => {});
    PUBLIC.get(`/services/${slug}`).then(r => setServices(r.data)).catch(() => setServices([]));
    PUBLIC.get(`/day-offer/${slug}`).then(r => setDayOffer(r.data.offer)).catch(() => {});
    PUBLIC.get(`/packages/${slug}`).then(r => setPackages(r.data.packages)).catch(() => {});
    PUBLIC.get(`/staff/${slug}`).then(r => setStaff(r.data)).catch(() => setStaff([]));
    PUBLIC.get(`/reviews/featured/${slug}`).then(r => setFeatured(r.data)).catch(() => setFeatured([]));
    PUBLIC.get(`/gallery/${slug}`).then(r => setGallery(r.data)).catch(() => setGallery([]));
    PUBLIC.get(`/service-categories/${slug}`).then(r => setCatImages(r.data || {})).catch(() => {});
    PUBLIC.get(`/service-category-order/${slug}`).then(r => setCatOrder(r.data.order || [])).catch(() => {});
  }, [PUBLIC, slug]);

  const byCategory = useMemo(() => services.reduce((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {}), [services]);

  const pickedServices = useMemo(
    () => services.filter(s => picked.includes(s.id)),
    [services, picked],
  );
  const total = pickedServices.reduce((a, s) => a + s.price, 0);
  const duration = pickedServices.reduce((a, s) => a + s.duration_min, 0);

  const toggleService = useCallback(
    id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]),
    [],
  );

  const pickByNames = useCallback((names, label) => {
    const wanted = names.map(n => (n || "").toLowerCase().trim());
    const matched = services.filter(s => wanted.includes(s.name.toLowerCase().trim()));
    if (matched.length === 0) { toast.error("These services aren't bookable online right now"); return; }
    setPicked(p => [...new Set([...p, ...matched.map(s => s.id)])]);
    const skipped = names.length - matched.length;
    toast.success(`${label} added — ${matched.length} service${matched.length > 1 ? "s" : ""} selected ✦${skipped > 0 ? ` (${skipped} available in-salon only)` : ""}`);
    document.getElementById("booking-wizard")?.scrollIntoView({ behavior: "smooth" });
  }, [services]);

  const handleFormChange = useCallback(next => {
    setReferralCheck(prev => (next.referral_code !== form.referral_code ? null : prev));
    setCouponCheck(prev => (next.coupon_code !== form.coupon_code ? null : prev));
    setForm(next);
  }, [form.referral_code, form.coupon_code]);

  function next() {
    const isResto = salon?.business_type === "restaurant";
    if (step === 0 && picked.length === 0 && !isResto) { toast.error("Please pick at least one service"); return; }
    if (step === 2 && !time) { toast.error("Pick a time slot"); return; }
    if (step === 3) {
      if (!/^[A-Za-z][A-Za-z .'-]{1,}$/.test(form.name.trim())) { toast.error("Name should contain only letters"); return; }
      if (!/^[6-9]\d{9}$/.test(form.phone.trim())) { toast.error("Enter a valid 10-digit mobile number"); return; }
    }
    setStep(step + 1);
  }
  function back() { setStep(Math.max(0, step - 1)); }

  const checkReferral = useCallback(async () => {
    const code = form.referral_code.trim().toUpperCase();
    if (!code) { setReferralCheck(null); return; }
    try {
      const { data } = await PUBLIC.get(`/referral/${slug}/${encodeURIComponent(code)}`);
      setReferralCheck({ valid: true, ...data });
    } catch (e) {
      setReferralCheck({ valid: false, error: e.response?.data?.detail || "Invalid code" });
    }
  }, [PUBLIC, slug, form.referral_code]);

  const checkCoupon = useCallback(async () => {
    const code = (form.coupon_code || "").trim().toUpperCase();
    if (!code) { setCouponCheck(null); return; }
    try {
      const { data } = await PUBLIC.get(`/coupon-check/${slug}/${encodeURIComponent(code)}`);
      setCouponCheck({ valid: true, ...data });
    } catch (e) {
      setCouponCheck({ valid: false, error: e.response?.data?.detail || "Invalid coupon" });
    }
  }, [PUBLIC, slug, form.coupon_code]);

  async function submit() {
    setBusy(true);
    try {
      const scheduled = `${date}T${time}:00+05:30`;
      const isResto2 = salon?.business_type === "restaurant";
      let notesOut = form.notes || "";
      if (isResto2) {
        const SPICE_LBL = { not_spicy: "Not spicy", normal: "Normal", spicy: "Spicy 🌶" };
        const spiceLines = pickedServices.map(s => `${s.name}: ${SPICE_LBL[spiceMap[s.id] || "normal"]}`);
        const extras = [];
        if (spiceLines.length) extras.push(`Spice — ${spiceLines.join("; ")}`);
        extras.push(`Payment: ${payPref === "upi" ? "Pay by UPI" : "Pay on Counter"}`);
        notesOut = [notesOut, ...extras].filter(Boolean).join("\n");
      }
      const { data } = await PUBLIC.post(`/book/${slug}`, {
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim(),
        customer_email: form.email.trim() || null,
        gender: form.gender || null,
        service_ids: picked,
        staff_id: staffId || null,
        scheduled_at: scheduled,
        notes: notesOut || null,
        referral_code: form.referral_code.trim().toUpperCase() || null,
        coupon_code: couponCheck?.valid ? form.coupon_code.trim().toUpperCase() : null,
        party_size: salon?.business_type === "restaurant" ? partySize : null,
        seating: salon?.business_type === "restaurant" ? seating : null,
      });
      setConfirmation(data);
      setStep(5);
      toast.success("Booking confirmed!");
    } catch (e) {
      toast.error(describeBookingError(e));
    } finally { setBusy(false); }
  }

  function bookAnother() {
    setStep(0); setPicked([]); setTime(""); setReferralCheck(null); setCouponCheck(null);
    setForm(INITIAL_FORM);
    setConfirmation(null);
  }

  if (!salon) return <BrandSplash />;
  if (salon.error) return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
      <div className="card-luxe max-w-md text-center" data-testid="book-tenant-not-found">
        <h2 className="font-playfair text-2xl text-red-400">Salon not found</h2>
        <p className="text-ink-secondary text-sm mt-2">We couldn&apos;t find a Miracurl salon at <span className="text-gold font-mono">/book/{slug}</span>. Please double-check the link.</p>
      </div>
    </div>
  );

  const bgImage = BOOK_BG_IMAGES[salon.book_bg];
  const effLogoShape = salon.logo_shape || (logoWide ? "square" : "circle");
  return (
    <div className={salon.book_bg ? "min-h-screen text-ink-primary" : "min-h-screen mesh-dark text-ink-primary"}
      style={salon.book_bg ? (bgImage
        ? { background: `linear-gradient(rgba(24,16,27,${bgImage.veil}), rgba(24,16,27,${bgImage.veil})), url(${bgImage.src}) center / cover no-repeat fixed` }
        : { background: salon.book_bg }) : undefined}
      data-testid="public-book-page">
      <Toaster theme="dark" position="top-center" toastOptions={TOASTER_OPTIONS} />

      {/* Premium tenant-branded top bar — logo, name & colour from the tenant's dashboard */}
      <div className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl border-b border-[#e8dcc0] shadow-[0_2px_20px_rgba(180,140,50,0.08)]"
        style={{ background: HEADER_GRADS[salon.header_bg] || salon.header_bg || "rgba(253,251,244,0.95)" }} data-testid="book-top-bar">
        <div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0 relative" data-testid="book-header-brand">
            <span className="tenant-sparkle" style={{ top: "-4px", left: "78px", color: "#b08d3f" }}>✦</span>
            <span className="tenant-sparkle" style={{ top: "68px", left: "-8px", color: "#b08d3f", animationDelay: "0.9s" }}>✦</span>
            <span className="tenant-sparkle" style={{ top: "6px", left: "-12px", color: "#d4af37", animationDelay: "1.7s" }}>✦</span>
            <span className="tenant-sparkle" style={{ top: "76px", left: "72px", color: "#d4af37", animationDelay: "2.3s" }}>✦</span>
            {salon.logo_url ? (
              effLogoShape === "blend" ? (
                <img src={salon.logo_url} alt={salon.name} onLoad={onLogoLoad}
                  className="h-14 sm:h-16 w-auto max-w-[200px] object-contain flex-shrink-0 z-10 drop-shadow-[0_2px_8px_rgba(160,120,40,0.35)]" />
              ) : effLogoShape === "square" ? (
                <span className="tenant-logo-glow h-16 sm:h-[4.5rem] rounded-2xl p-[3px] bg-gradient-to-br from-[#d4af37] via-[#f3e3ae] to-[#b08d3f] flex-shrink-0 shadow-[0_4px_18px_rgba(180,140,50,0.5)] z-10">
                  <span className="h-full rounded-[13px] overflow-hidden bg-[#17141c] flex items-center justify-center px-2.5">
                    <img src={salon.logo_url} alt={salon.name} onLoad={onLogoLoad} className="h-[85%] w-auto max-w-[150px] object-contain" />
                  </span>
                </span>
              ) : (
                <span className="tenant-logo-glow w-20 h-20 sm:w-[5.5rem] sm:h-[5.5rem] -my-2 rounded-full p-[3px] bg-gradient-to-br from-[#d4af37] via-[#f3e3ae] to-[#b08d3f] flex-shrink-0 shadow-[0_4px_18px_rgba(180,140,50,0.5)] z-10">
                  <span className="w-full h-full rounded-full overflow-hidden bg-[#17141c] block">
                    <img src={salon.logo_url} alt={salon.name} onLoad={onLogoLoad} className="w-full h-full object-cover scale-[1.45]" />
                  </span>
                </span>
              )
            ) : (
              <span className="tenant-logo-glow w-20 h-20 sm:w-[5.5rem] sm:h-[5.5rem] -my-2 rounded-full p-[3px] bg-gradient-to-br from-[#d4af37] via-[#f3e3ae] to-[#b08d3f] flex-shrink-0 shadow-[0_4px_18px_rgba(180,140,50,0.5)] z-10">
                <span className="w-full h-full rounded-full bg-[#17141c] text-[#e8c37f] flex items-center justify-center font-playfair text-3xl font-bold">
                  {(salon.name || "M").charAt(0)}
                </span>
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <div className="font-playfair text-sm sm:text-base tracking-[0.06em] text-[#8a6d1f] font-semibold truncate">{salon.name}</div>
              <div className="text-[8px] sm:text-[10px] uppercase tracking-[0.32em] text-[#a5926a] truncate mt-0.5">
                {salon.business_type === "restaurant" ? "Fine Dining · Powered by Mira AI" : "Luxury Salon · Powered by Mira AI"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to="/book" data-testid="find-salon-link"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#dcc98f] text-[11px] text-[#8a6d1f] hover:bg-[#f6eeda] transition-colors">
              <Star className="w-3 h-3 text-[#b08d3f]" /> {salon.business_type === "restaurant" ? "Explore Miracurl" : "Find a salon"}
            </Link>
            <button
              data-testid="book-header-cta"
              onClick={goToServices}
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#d4af37] to-[#e6c66e] text-[#17141c] text-xs sm:text-sm font-bold shadow-[0_2px_12px_rgba(180,140,50,0.4)] hover:opacity-90 transition-opacity">
              {salon.business_type === "restaurant" ? "Reserve a Table ✦" : "Book Appointment ✦"}
            </button>
          </div>
        </div>
      </div>

      <header className="relative overflow-hidden mt-20">
        <img src={salon.hero_image} className="absolute inset-0 w-full h-full object-cover" alt="" />
        {dayOffer?.is_festival && festTheme(dayOffer.occasion) && (() => { const th = festTheme(dayOffer.occasion); return (
          <div data-testid="hero-festival-ribbon" className="absolute top-0 inset-x-0 z-20 flex items-center justify-center gap-2 py-1.5 text-[11px] font-semibold text-white tracking-wide"
            style={{ background: `linear-gradient(90deg, ${th.from}, ${th.to})`, boxShadow: `0 6px 24px -6px ${th.glow}` }}>
            <span>{dayOffer.occasion} special</span>
            {dayOffer.discount_pct > 0 && <span className="px-2 py-0.5 rounded-full bg-white/20 border border-white/30">{dayOffer.discount_pct}% off today</span>}
            <button onClick={() => document.getElementById("day-offer-banner")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="underline underline-offset-2 opacity-90 hover:opacity-100">See offer</button>
          </div>
        ); })()}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-bg-base" />
        {/* Animated Mira AI orb */}
        <button
          data-testid="hero-ai-orb"
          onClick={() => openMira("ai")}
          aria-label="Chat with Mira AI"
          className="ai-orb absolute top-14 right-4 sm:top-16 sm:right-8 z-20 flex flex-col items-center gap-1.5"
        >
          <span className="relative w-14 h-14 sm:w-16 sm:h-16">
            <span className="ai-orb-ring absolute -inset-1.5 rounded-full" />
            <span className="ai-orb-core absolute inset-0 rounded-full overflow-hidden flex items-center justify-center">
              <img src="/mira-bot.png" alt="Mira AI" className="w-full h-full object-cover" />
            </span>
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-gold bg-black/50 backdrop-blur px-2 py-0.5 rounded-full border border-gold/30">Mira AI</span>
        </button>
        <div className="relative z-10 max-w-5xl mx-auto flex flex-col justify-end p-6 sm:p-10 pt-14 sm:pt-20">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gold mb-2">{salon.business_type === "restaurant" ? "Reserve Your Table" : "Book Your Visit"}</div>
          <h1 className="font-playfair text-3xl sm:text-5xl leading-tight max-w-2xl">{salon.tagline}.</h1>
          {/* Row A — where & when (quiet glass chips) */}
          <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/35 backdrop-blur border border-white/10 text-white/80" data-testid="hero-location-chip">
              <MapPin className="w-3 h-3 text-gold" /> {salon.location}
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/35 backdrop-blur border border-white/10 text-white/80" data-testid="hero-hours-chip">
              <Clock className="w-3 h-3 text-gold" /> {salon.hours}
            </span>
          </div>

          {/* Row B — trust + contact, one aligned line */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {salon.trusted_badge && (
              <span data-testid="salon-trusted-badge" title={`Settled Miracurl Brand Model campaign · since ${salon.trusted_badge.since}`}
                className="inline-flex items-center gap-2 h-11 rounded-full pl-1.5 pr-4 bg-[#0f1a14] border border-emerald-400/50 shadow-[0_8px_28px_-8px_rgba(16,185,129,0.45)]">
                <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center"><ShieldCheck className="w-4 h-4" /></span>
                <span className="leading-tight text-left">
                  <span className="block text-[11px] font-extrabold text-emerald-200 tracking-wide">TRUSTED BY MIRACURL</span>
                  <span className="block text-[9.5px] text-emerald-100/60">Verified partner salon · since {String(salon.trusted_badge.since || "").slice(0, 4)}</span>
                </span>
              </span>
            )}
            {salon.rating?.avg >= 3.5 && (() => {
              const onGoogle = salon.rating?.source === "google" || !!salon.google_review_url;
              return (
                <a href={salon.google_review_url || "#reviews"} target={salon.google_review_url ? "_blank" : undefined} rel="noreferrer"
                  data-testid="salon-rating-badge"
                  className="inline-flex items-center gap-2.5 h-11 bg-white rounded-full pl-1.5 pr-4 shadow-[0_8px_28px_-8px_rgba(0,0,0,0.45)] hover:-translate-y-0.5 transition-transform">
                  <span className="w-8 h-8 rounded-full bg-[#1a73e8] text-white font-extrabold text-sm flex items-center justify-center">{salon.rating.avg}</span>
                  <span className="leading-tight text-left">
                    <span className="block text-[11px] font-extrabold text-slate-800 tracking-wide">
                      {salon.rating.avg >= 4.7 ? "EXCELLENT" : salon.rating.avg >= 4.3 ? "GREAT" : "GOOD"}
                      <span className="ml-1 text-amber-400" aria-hidden>{"★".repeat(Math.round(salon.rating.avg))}</span>
                    </span>
                    <span className="block text-[9.5px] text-slate-500">
                      {Number(salon.rating.count).toLocaleString("en-IN")} reviews {onGoogle ? "on " : ""}
                      {onGoogle && <b><span className="text-[#1a73e8]">G</span><span className="text-[#ea4335]">o</span><span className="text-[#fbbc05]">o</span><span className="text-[#1a73e8]">g</span><span className="text-[#34a853]">l</span><span className="text-[#ea4335]">e</span></b>}
                    </span>
                  </span>
                </a>
              );
            })()}
            {salon.phone && (() => {
              const digits = salon.phone.replace(/\D/g, "");
              const wa = digits.length === 10 ? `91${digits}` : digits;
              return (
                <div className="flex items-center gap-2">
                  <a href={`tel:${salon.phone.replace(/\s/g, "")}`} data-testid="hero-call-now-btn"
                    className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-semibold hover:bg-white/20 hover:border-gold/60 transition-colors">
                    <PhoneIcon className="w-3.5 h-3.5 text-gold" /> Call
                  </a>
                  <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${salon.name}! I found you on Miracurl ✨`)}`}
                    target="_blank" rel="noreferrer" data-testid="hero-whatsapp-btn"
                    className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-[#25D366] text-[#0b2b16] text-xs font-bold shadow-[0_2px_12px_rgba(37,211,102,0.35)] hover:opacity-90 transition-opacity">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm5.4 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.5c-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4-.1.6.5l.8 1.9c.1.1.1.3 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1.1 2.2 1.4 2.5 1.5.3.2.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l1.8.9c.3.1.5.2.6.3 0 .2 0 .7-.2 1.2z" /></svg>
                    WhatsApp
                  </a>
                </div>
              );
            })()}
          </div>

          {/* Row C — primary actions */}
          <HeroCTAs restaurant={salon.business_type === "restaurant"} />

          {rewards && (
            <Link to={`/rewards/${slug}`} data-testid="hero-rewards-banner"
              className="group relative mt-5 max-w-2xl flex items-center gap-4 p-3.5 pr-5 rounded-2xl overflow-hidden border border-[#d4af37]/60 bg-gradient-to-r from-[#1a1508]/80 via-[#2a1f0a]/70 to-[#1a1508]/80 backdrop-blur-md shadow-[0_12px_40px_-12px_rgba(212,175,55,.55)] hover:border-[#F0D9A5] transition-colors">
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(240,217,165,.18)_50%,transparent_70%)] translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              <span className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 ring-2 ring-[#d4af37]/70 shadow-lg">
                <img src="/brand-model-hero.jpg" alt="" className="w-full h-full object-cover object-top" />
              </span>
              <span className="relative min-w-0 flex-1 text-left">
                <span className="block text-[10px] tracking-[0.3em] uppercase text-[#F0D9A5]/90">✦ Casting open</span>
                <span className="block font-playfair text-lg sm:text-xl text-white leading-tight">Become our Brand Model</span>
                <span className="block text-[11px] text-white/70 mt-0.5">Spend ₹{Number(rewards.campaign.min_transaction).toLocaleString("en-IN")}+, share your look & win a Diamond · Platinum · Gold membership — be the face of {salon.name}</span>
              </span>
              <span className="relative shrink-0 w-9 h-9 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] flex items-center justify-center text-[#15151b] group-hover:scale-110 transition-transform"><ArrowRight className="w-4 h-4" /></span>
            </Link>
          )}
          {/* Row D — Gift card & Membership: two matched glass feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 max-w-2xl" data-testid="hero-secondary-links">
            {salon.business_type === "restaurant" ? (
              <Link to={`/order/${slug}`} data-testid="hero-order-food-btn"
                className="hero-card hero-card-food group flex items-center gap-3 p-3 pr-4 rounded-2xl backdrop-blur-md border">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center shrink-0 shadow-lg text-white hero-card-icon"><UtensilsCrossed className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold text-white">Order food at your table</span>
                  <span className="block text-[11px] text-white/60">Scan, order & eat — no waiting</span>
                </span>
                <ArrowRight className="w-4 h-4 text-gold opacity-70 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ) : (<>
              <Link to={`/gift/${slug}`} data-testid="hero-gift-card-btn"
                className="hero-card hero-card-gift group flex items-center gap-3 p-3 pr-4 rounded-2xl backdrop-blur-md border">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-500 to-rose-400 flex items-center justify-center shrink-0 shadow-lg text-white hero-card-icon"><Gift className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold text-white whitespace-nowrap">Gift Card</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-white/60 whitespace-nowrap" data-testid="hero-gift-price">
                    {giftPreview ? <>
                      <span>from <b className="text-white/90">₹{giftPreview.from.toLocaleString("en-IN")}</b></span>
                      <span data-testid="hero-gift-instant" className="text-[10px] font-bold px-1.5 py-px rounded-full bg-gradient-to-r from-fuchsia-400 to-rose-400 text-white">⚡ instant e-card</span>
                    </> : "Treat someone you love"}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gold opacity-70 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link to={`/membership/${slug}`} data-testid="hero-membership-btn"
                className="hero-card hero-card-member group flex items-center gap-3 p-3 pr-4 rounded-2xl backdrop-blur-md border">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center shrink-0 shadow-lg text-bg-base hero-card-icon"><CreditCard className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold text-white whitespace-nowrap">Premium Membership</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-white/60 whitespace-nowrap" data-testid="hero-membership-price">
                    {memberPreview ? <>
                      <span>from <b className="text-white/90">₹{memberPreview.from.toLocaleString("en-IN")}</b>/yr</span>
                      {memberPreview.cashback > 0 && (
                        <span data-testid="hero-membership-cashback" className="text-[10px] font-bold px-1.5 py-px rounded-full bg-gold text-bg-base">{memberPreview.cashback}% cashback</span>
                      )}
                    </> : "Earn cashback on every visit"}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gold opacity-70 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </>)}
          </div>
        </div>
      </header>

      <main id="booking-wizard" className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {step === 0 && dayOffer && (
          <div id="day-offer-banner" className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/15 via-blush/10 to-transparent mb-8" data-testid="day-offer-banner"
            style={dayOffer.is_festival && festTheme(dayOffer.occasion) ? { borderColor: `${festTheme(dayOffer.occasion).from}66`, boxShadow: `0 12px 40px -18px ${festTheme(dayOffer.occasion).glow}` } : undefined}>
            <span aria-hidden className="absolute top-3 right-4 text-gold" style={{ animation: "sparkle-twinkle 2.4s ease-in-out infinite" }}>✦</span>
            <span aria-hidden className="absolute bottom-3 right-10 text-blush text-xs" style={{ animation: "sparkle-twinkle 2.4s ease-in-out 1s infinite" }}>✦</span>
            <div className="flex flex-col sm:flex-row sm:items-stretch">
              <div className="relative flex-1 p-5 sm:p-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <span data-testid="day-offer-occasion" className="px-3 py-1 rounded-full bg-gold text-bg-base text-[10px] font-bold uppercase tracking-widest shrink-0">
                    {dayOffer.kind === "flash" ? "⚡ Flash offer" : dayOffer.occasion || `✨ ${dayOffer.day_name || "Today"}'s offer`}
                  </span>
                  {dayOffer.ends_at && <OfferCountdown endsAt={dayOffer.ends_at} />}
                </div>
                <h3 className="font-playfair text-xl sm:text-2xl text-gold leading-snug mt-3">{dayOffer.title}</h3>
                <p className="text-xs text-white/60 mt-1">{dayOffer.offer_text}</p>
                {dayOffer.services?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {dayOffer.services.map((sv, i) => (
                      <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-white/85" data-testid={`day-offer-service-${i}`}>
                        {sv.name}
                        {sv.price && sv.offer_price && sv.offer_price < sv.price && (
                          <> <s className="opacity-50">₹{Math.round(sv.price)}</s> <b className="text-gold">₹{Math.round(sv.offer_price)}</b></>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-white/35 mt-3">Today only — mention this offer at the salon or book below.</p>
                <button data-testid="day-offer-book-btn"
                  onClick={() => pickByNames((dayOffer.services || []).map(sv => sv.name), "Today's offer")}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gold text-bg-base text-xs font-bold hover:opacity-90">
                  Book this offer →
                </button>
              </div>
              {dayOffer.discount_pct > 0 && (
                <div data-testid="day-offer-discount" className="relative sm:w-48 shrink-0 flex flex-col items-center justify-center gap-1 px-5 py-6 sm:py-0 border-t sm:border-t-0 sm:border-l border-gold/25 bg-gradient-to-b from-gold/20 to-blush/10"
                  style={dayOffer.is_festival && festTheme(dayOffer.occasion) ? { background: `linear-gradient(180deg, ${festTheme(dayOffer.occasion).from}33, ${festTheme(dayOffer.occasion).to}33)` } : undefined}>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-white/50">{dayOffer.is_festival ? "Festive special" : "Today only"}</span>
                  <span className="font-playfair text-5xl sm:text-6xl text-gold leading-none">{dayOffer.discount_pct}<span className="text-2xl align-top">%</span></span>
                  <span className="text-xs font-bold uppercase tracking-widest text-white/85">off</span>
                  <span className="text-[10px] text-white/45 mt-1">{dayOffer.day_name || "Today"}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {step === 0 && <WalletCheck slug={slug} />}
        {step === 0 && packages.length > 0 && (
          <div className="mb-8" data-testid="packages-section">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3">✦ Signature packages</div>
            <div className="grid sm:grid-cols-2 gap-4">
              {packages.map(p => (
                <div key={p.id} className="relative overflow-hidden rounded-2xl border border-blush/30 bg-gradient-to-br from-blush/10 to-transparent" data-testid="package-public-card">
                  <div className="relative h-32">
                    <img
                      src={serviceImage(`${p.audience === "men" ? "men grooming " : ""}${p.name} ${(p.services || []).map(sv => sv.name).join(" ")}`, salon.business_type === "restaurant")}
                      alt={p.name} loading="lazy" data-testid="package-image"
                      className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#171117] via-black/30 to-black/10" />
                    <div className="absolute bottom-2 left-4 flex items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/45 backdrop-blur-sm border border-white/20 text-white/80">
                        {p.audience === "men" ? "For Men" : p.audience === "women" ? "For Women" : "Family"}
                      </span>
                      {p.expires_at && (
                        <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500/25 backdrop-blur-sm border border-red-400/40 text-red-200">
                          ⏳ Till {new Date(p.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                    {p.discount_pct > 0 && (
                      <span className="absolute top-2 right-3 px-2.5 py-1 rounded-full bg-gold text-bg-base text-[10px] font-bold shadow-lg">{p.discount_pct}% OFF</span>
                    )}
                  </div>
                  <div className="p-5 pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-playfair text-lg text-blush leading-snug">{p.name}</h3>
                      <p className="text-xs text-white/55 mt-0.5">{p.tagline}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-white/35 line-through">₹{Math.round(p.total_value)}</div>
                      <div className="text-xl font-bold text-gold">₹{Math.round(p.package_price)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(p.services || []).map((sv, i) => (
                      <span key={i} className="text-[11px] bg-white/5 border border-white/10 rounded-full px-2.5 py-1">{sv.name}</span>
                    ))}
                  </div>
                  <button data-testid="package-book-btn"
                    onClick={() => pickByNames((p.services || []).map(sv => sv.name), p.name)}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-blush to-gold text-bg-base text-xs font-bold hover:opacity-90">
                    Book this package →
                  </button>
                  <p className="text-[10px] text-white/30 mt-2">Package price honoured at the salon ✦</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {step === 0 && <FeaturedReviews featured={featured} />}
        {step < 5 && <Stepper step={step} labels={salon.business_type === "restaurant" ? RESTO_LABELS : STEP_LABELS} />}

        {step === 0 && <ServicesStep byCategory={byCategory} picked={picked} onToggle={toggleService} catImages={catImages} catOrder={catOrder} restaurant={salon.business_type === "restaurant"} />}
        {step === 1 && <StaffStep staff={staff} staffId={staffId} onPick={setStaffId} date={date} restaurant={salon.business_type === "restaurant"} />}
        {step === 2 && (
          <>
            {salon.business_type === "restaurant" && (
              <div className="mb-8 grid sm:grid-cols-2 gap-5" data-testid="reservation-extras">
                <div>
                  <div className="text-[10px] tracking-[0.25em] uppercase text-gold mb-2">Party size</div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                      <button key={n} data-testid={`party-size-${n}`} onClick={() => setPartySize(n)}
                        className={`w-10 h-10 rounded-full border text-sm font-bold transition-colors ${partySize === n ? "bg-gold text-bg-base border-gold" : "border-white/15 text-white/70 hover:border-gold/50"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.25em] uppercase text-gold mb-2">Seating preference</div>
                  <div className="flex gap-2">
                    {[["any", "✨ Any"], ["indoor", "🏠 Indoor"], ["outdoor", "🌿 Outdoor"]].map(([v, l]) => (
                      <button key={v} data-testid={`seating-${v}`} onClick={() => setSeating(v)}
                        className={`px-4 py-2.5 rounded-full border text-xs font-bold transition-colors ${seating === v ? "bg-gold text-bg-base border-gold" : "border-white/15 text-white/70 hover:border-gold/50"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {pickedServices.length > 0 && (
                  <div className="sm:col-span-2" data-testid="spice-prefs-block">
                    <div className="text-[10px] tracking-[0.25em] uppercase text-gold mb-2">Spice preference — per dish</div>
                    <div className="space-y-2">
                      {pickedServices.map(s => (
                        <div key={s.id} className="flex items-center justify-between gap-3 flex-wrap bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                          <span className="text-xs text-white/85 font-medium">{s.name}</span>
                          <div className="flex gap-1.5">
                            {[["not_spicy", "🥛 Not spicy"], ["normal", "🙂 Normal"], ["spicy", "🌶 Spicy"]].map(([v, l]) => (
                              <button key={v} data-testid={`spice-${s.id}-${v}`}
                                onClick={() => setSpiceMap(m => ({ ...m, [s.id]: v }))}
                                className={`px-2.5 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${(spiceMap[s.id] || "normal") === v ? "bg-gold text-bg-base border-gold" : "border-white/15 text-white/70 hover:border-gold/50"}`}>
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <div className="text-[10px] tracking-[0.25em] uppercase text-gold mb-2">How would you like to pay?</div>
                  <div className="flex gap-2">
                    {[["counter", "💵 Pay on Counter"], ["upi", "📱 Pay by UPI"]].map(([v, l]) => (
                      <button key={v} data-testid={`paypref-${v}`} onClick={() => setPayPref(v)}
                        className={`px-4 py-2.5 rounded-full border text-xs font-bold transition-colors ${payPref === v ? "bg-gold text-bg-base border-gold" : "border-white/15 text-white/70 hover:border-gold/50"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DateTimeStep date={date} time={time} onDate={setDate} onTime={setTime} availability={availability} salon={salon} />
          </>
        )}
        {step === 3 && <DetailsStep form={form} onChange={handleFormChange} referralCheck={referralCheck} onCheckReferral={checkReferral} couponCheck={couponCheck} onCheckCoupon={checkCoupon} />}
        {step === 4 && (
          <ConfirmStep
            pickedServices={pickedServices}
            staff={staff}
            staffId={staffId}
            date={date}
            time={time}
            form={form}
            total={total}
            duration={duration}
            restaurant={salon.business_type === "restaurant"}
          />
        )}
        {step === 5 && <SuccessStep confirmation={confirmation} onBookAnother={bookAnother} />}

        {step < 5 && (
          <div className="mt-10 flex items-center justify-between gap-4 sticky bottom-0 py-4 bg-bg-base/90 backdrop-blur-xl border-t border-white/5 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <button data-testid="book-back-btn" onClick={back} disabled={step === 0} className="btn-ghost flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-sm text-ink-secondary hidden sm:block">
              {picked.length > 0 && (
                <span>{picked.length} service{picked.length > 1 ? "s" : ""} · <span className="text-gold">₹{total}</span> · {duration}m</span>
              )}
            </div>
            {step < 4 ? (
              <button data-testid="book-next-btn" onClick={next} className="btn-gold flex items-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button data-testid="book-confirm-btn" onClick={submit} disabled={busy} className="btn-gold flex items-center gap-2">
                {busy ? "Booking..." : <>Confirm Booking <Calendar className="w-4 h-4" /></>}
              </button>
            )}
          </div>
        )}

        {step === 0 && (
          <>
            <OffersShowcase items={gallery.filter(g => g.source === "offer")} />
            <GalleryShowcase items={gallery.filter(g => g.source !== "offer")} />
            <VerifiedTeam staff={staff} restaurant={salon.business_type === "restaurant"} />
            {salon.business_type !== "restaurant" && salon.show_products !== false && <MiracurlProductsStrip compact />}
            <ReferEarnBanner salonName={salon.name} reward={salon.referral_reward} />
            <AITrustStrip />
          </>
        )}
      </main>

      <LocationsSection salon={salon} />

      <footer className="border-t border-white/5 mt-10 py-8 text-center text-xs text-ink-muted">
        <div className="flex items-center justify-center gap-4 mb-4">
          {salon?.instagram_url && (
            <a
              href={salon.instagram_url}
              target="_blank"
              rel="noreferrer"
              data-testid="book-instagram-link"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-500 text-white shadow-lg hover:scale-105 transition"
              aria-label="Instagram"
              title="Follow us on Instagram"
            >
              <Instagram className="w-5 h-5" />
            </a>
          )}
          {salon?.whatsapp_number && (
            <a
              href={`https://wa.me/${salon.whatsapp_number}?text=${encodeURIComponent(`Hi ${salon.name || "Miracurl"}, I'd like to know about your services.`)}`}
              target="_blank"
              rel="noreferrer"
              data-testid="book-whatsapp-link"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg hover:scale-105 transition"
              aria-label="Chat on WhatsApp"
              title="Chat on WhatsApp"
            >
              <MessageCircle className="w-5 h-5" />
            </a>
          )}
          {salon?.phone && (
            <button
              type="button"
              onClick={() => openMira("ai")}
              data-testid="book-talk-to-mira-btn"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-lg hover:scale-105 transition"
              aria-label="Talk to Mira — AI voice assistant"
              title="🎙️ Talk to Mira — she answers instantly, books for you, or connects you to the salon"
            >
              <PhoneIcon className="w-5 h-5" />
            </button>
          )}
        </div>
        {salon?.google_review_url && (
          <a href={salon.google_review_url} target="_blank" rel="noreferrer" data-testid="book-google-review-link" className="inline-flex items-center gap-2 text-gold hover:text-gold-hover mb-3">
            <Star className="w-3 h-3 fill-gold text-gold" /> Review us on Google
          </a>
        )}
        <div>
          © Miracurl · Crafted with care in Marathahalli ·{" "}
          <a href={`/success-stories?ref=${slug}`} target="_blank" rel="noreferrer" data-testid="powered-by-miracurl-link"
            className="text-gold/80 hover:text-gold underline underline-offset-2">
            Powered by Miracurl — get this for your salon ✦
          </a>
          {" · "}
          <a href="https://www.instagram.com/miracurl.ai/" target="_blank" rel="noreferrer" data-testid="powered-by-instagram-link" className="text-gold/80 hover:text-gold">@miracurl.ai</a>
        </div>
      </footer>
      <InstallAppPrompt />
      <BookingChatWidget slug={slug} restaurant={salon.business_type === "restaurant"} />
    </div>
  );
}

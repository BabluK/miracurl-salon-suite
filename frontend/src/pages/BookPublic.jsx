import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Scissors, Check, ArrowRight, ArrowLeft, Clock, IndianRupee, Calendar, Phone as PhoneIcon, MapPin, Star, Instagram, MessageCircle, Sparkles } from "lucide-react";
import { toast, Toaster } from "sonner";
import { FeaturedReviews, ServicesStep, StaffStep, DateTimeStep, DetailsStep, ConfirmStep, SuccessStep } from "./BookPublic.steps";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import BookingChatWidget from "@/components/BookingChatWidget";
import { HeroCTAs, GalleryShowcase, OffersShowcase, VerifiedTeam, ReferEarnBanner, AITrustStrip, LocationsSection, openMira } from "@/components/BookPublicExtras";
import { MiracurlProductsStrip } from "@/components/MiracurlProductsStrip";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const DEFAULT_SLUG = "miracurl-marathahalli";
const TOASTER_STYLE = { background: '#121212', color: '#fff', border: '1px solid rgba(212,175,55,0.3)' };
const TOASTER_OPTIONS = { style: TOASTER_STYLE };
const STEP_LABELS = ["Services", "Stylist", "Date & Time", "Your Details", "Confirm"];
const RESTO_LABELS = ["Menu (optional)", "Host", "Date & Time", "Your Details", "Confirm"];
const INITIAL_FORM = { name: "", phone: "", email: "", notes: "", referral_code: "", coupon_code: "", gender: "Female" };
const localToday = () => new Date().toLocaleDateString("en-CA");

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
      const { data } = await axios.post(`${BACKEND_URL}/api/public/wallet-balance/${slug}`, { phone });
      setResult(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Try again in a few minutes");
    } finally { setBusy(false); }
  };

  return (
    <div className="mb-8 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4" data-testid="wallet-check-widget">
      {result?.found ? (
        <div className="flex items-center justify-between flex-wrap gap-2" data-testid="wallet-check-result">
          <div>
            <div className="text-sm text-emerald-300 font-semibold">You have <span className="text-gold font-bold">₹{Math.round(result.balance).toLocaleString("en-IN")}</span> salon credit 💸</div>
            <div className="text-[11px] text-white/40 mt-0.5">Book below — your wallet applies when you pay at the salon ✦</div>
          </div>
          <button onClick={() => setResult(null)} className="text-[11px] text-white/40 underline">check another</button>
        </div>
      ) : (
        <form onSubmit={check} className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/60 font-medium shrink-0">💳 Have a wallet with us?</span>
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
  const [services, setServices] = useState([]);
  const [dayOffer, setDayOffer] = useState(null);
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

  useEffect(() => {
    PUBLIC.get(`/salon/${slug}`).then(r => setSalon(r.data)).catch(() => setSalon({ error: true }));
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
      const { data } = await PUBLIC.post(`/book/${slug}`, {
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim(),
        customer_email: form.email.trim() || null,
        gender: form.gender || null,
        service_ids: picked,
        staff_id: staffId || null,
        scheduled_at: scheduled,
        notes: form.notes || null,
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

  if (!salon) return <div className="min-h-screen flex items-center justify-center bg-bg-base text-gold font-playfair text-2xl animate-pulse">Miracurl</div>;
  if (salon.error) return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
      <div className="card-luxe max-w-md text-center" data-testid="book-tenant-not-found">
        <h2 className="font-playfair text-2xl text-red-400">Salon not found</h2>
        <p className="text-ink-secondary text-sm mt-2">We couldn&apos;t find a Miracurl salon at <span className="text-gold font-mono">/book/{slug}</span>. Please double-check the link.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen mesh-dark text-ink-primary" data-testid="public-book-page">
      <Toaster theme="dark" position="top-center" toastOptions={TOASTER_OPTIONS} />

      <header className="relative h-80 sm:h-96 overflow-hidden">
        <img src={salon.hero_image} className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-bg-base" />
        <Link
          to="/book"
          data-testid="find-salon-link"
          className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur border border-white/15 text-xs text-white/80 hover:text-white hover:border-gold/50 transition-colors"
        >
          <Star className="w-3 h-3 text-gold" /> Find a salon
        </Link>
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
        <div className="relative z-10 max-w-5xl mx-auto h-full flex flex-col justify-end p-6 sm:p-10">
          <div className="flex items-center gap-3 mb-3">
            {salon.logo_url ? (
              <img src={salon.logo_url.startsWith("/api/") ? `${BACKEND_URL}${salon.logo_url}` : salon.logo_url} alt={salon.name} data-testid="hero-salon-logo" className="w-11 h-11 rounded-full object-cover border-2 border-gold shadow-gold-glow" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-gold flex items-center justify-center shadow-gold-glow">
                <Scissors className="w-5 h-5 text-bg-base" />
              </div>
            )}
            <div>
              <div className="font-playfair text-2xl">{salon.name || "Miracurl"}</div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gold">{salon.business_type === "restaurant" ? "Reserve Your Table" : "Book Your Visit"}</div>
            </div>
          </div>
          <h1 className="font-playfair text-3xl sm:text-5xl leading-tight max-w-2xl">{salon.tagline}.</h1>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-white/60">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gold" /> {salon.location}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-gold" /> {salon.hours}</span>
            <span className="flex items-center gap-1"><PhoneIcon className="w-3 h-3 text-gold" /> {salon.phone}</span>
          </div>
          {salon.rating?.avg >= 3.5 && (() => {
            const onGoogle = salon.rating?.source === "google" || !!salon.google_review_url;
            return (
            <a href={salon.google_review_url || "#reviews"} target={salon.google_review_url ? "_blank" : undefined} rel="noreferrer"
              data-testid="salon-rating-badge"
              className="mt-4 inline-flex items-center gap-3 w-fit bg-white rounded-2xl pl-2 pr-4 py-2 shadow-[0_8px_28px_-8px_rgba(0,0,0,0.45)] hover:-translate-y-0.5 transition-transform">
              <span className="w-11 h-11 rounded-full bg-[#1a73e8] text-white font-extrabold text-base flex items-center justify-center shadow-inner">{salon.rating.avg}</span>
              <span className="leading-tight text-left">
                <span className="block text-[13px] font-extrabold text-slate-800 tracking-wide">
                  {salon.rating.avg >= 4.7 ? "EXCELLENT" : salon.rating.avg >= 4.3 ? "GREAT" : "GOOD"}
                  <span className="ml-1.5 text-amber-400" aria-hidden>{"★".repeat(Math.round(salon.rating.avg))}</span>
                </span>
                <span className="block text-[10px] text-slate-500">
                  Rated by <b>{Number(salon.rating.count).toLocaleString("en-IN")}</b> customers {onGoogle ? "on " : ""}
                  {onGoogle && <b className="text-[#1a73e8]">G</b>}{onGoogle && <b><span className="text-[#ea4335]">o</span><span className="text-[#fbbc05]">o</span><span className="text-[#1a73e8]">g</span><span className="text-[#34a853]">l</span><span className="text-[#ea4335]">e</span></b>}
                </span>
              </span>
            </a>
            );
          })()}
          <HeroCTAs />
          <Link to={`/gift/${slug}`} data-testid="hero-gift-card-btn"
            className="mt-3 inline-flex items-center gap-2 w-fit px-5 py-2.5 rounded-full bg-gradient-to-r from-fuchsia-600/30 to-amber-500/30 backdrop-blur-md border border-gold/40 text-sm font-semibold text-white hover:border-gold hover:shadow-[0_0_24px_rgba(212,175,55,0.35)] transition-all">
            🎁 Gift Card for a Loved One
            <span className="text-[9px] uppercase tracking-widest bg-gold/20 border border-gold/40 text-gold px-1.5 py-0.5 rounded-full">New</span>
          </Link>
          <Link to={`/membership/${slug}`} data-testid="hero-membership-btn"
            className="mt-2 inline-flex items-center gap-2 w-fit px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-600/30 to-yellow-500/20 backdrop-blur-md border border-gold/40 text-sm font-semibold text-white hover:border-gold hover:shadow-[0_0_24px_rgba(212,175,55,0.35)] transition-all">
            💳 Premium Membership — earn cashback every visit
            <span className="text-[9px] uppercase tracking-widest bg-gold/20 border border-gold/40 text-gold px-1.5 py-0.5 rounded-full">New</span>
          </Link>
        </div>
      </header>

      <main id="booking-wizard" className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {step === 0 && dayOffer && (
          <div className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/15 via-blush/10 to-transparent p-5 mb-8" data-testid="day-offer-banner">
            <span aria-hidden className="absolute -top-1 right-6 text-gold" style={{ animation: "sparkle-twinkle 2.4s ease-in-out infinite" }}>✦</span>
            <span aria-hidden className="absolute bottom-2 right-24 text-blush text-xs" style={{ animation: "sparkle-twinkle 2.4s ease-in-out 1s infinite" }}>✦</span>
            <div className="flex items-start gap-3 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-gold text-bg-base text-[10px] font-bold uppercase tracking-widest shrink-0">
                {dayOffer.kind === "flash" ? "⚡ Flash offer" : `✨ ${dayOffer.day_name || "Today"}'s offer`}
              </span>
              {dayOffer.ends_at && <OfferCountdown endsAt={dayOffer.ends_at} />}
              <div className="min-w-0">
                <h3 className="font-playfair text-lg text-gold leading-snug">{dayOffer.title}</h3>
                <p className="text-xs text-white/60 mt-1">{dayOffer.offer_text}</p>
                {dayOffer.services?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {dayOffer.services.map((sv, i) => (
                      <span key={i} className="text-[11px] bg-white/5 border border-gold/25 rounded-full px-2.5 py-1">
                        {sv.name} <s className="text-white/35">₹{Math.round(sv.price)}</s> <b className="text-gold">₹{Math.round(sv.offer_price)}</b>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-white/35 mt-2">Today only — mention this offer at the salon or book below.</p>
                <button data-testid="day-offer-book-btn"
                  onClick={() => pickByNames((dayOffer.services || []).map(sv => sv.name), "Today's offer")}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gold text-bg-base text-xs font-bold hover:opacity-90">
                  Book this offer →
                </button>
              </div>
            </div>
          </div>
        )}
        {step === 0 && <WalletCheck slug={slug} />}
        {step === 0 && packages.length > 0 && (
          <div className="mb-8" data-testid="packages-section">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3">✦ Signature packages</div>
            <div className="grid sm:grid-cols-2 gap-4">
              {packages.map(p => (
                <div key={p.id} className="relative overflow-hidden rounded-2xl border border-blush/30 bg-gradient-to-br from-blush/10 to-transparent p-5" data-testid="package-public-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 border border-white/15 text-white/50">
                        {p.audience === "men" ? "For Men" : p.audience === "women" ? "For Women" : "Family"}
                      </span>
                      {p.expires_at && (
                        <span className="ml-1.5 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500/10 border border-red-400/30 text-red-300">
                          ⏳ Till {new Date(p.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      <h3 className="font-playfair text-lg text-blush leading-snug mt-1.5">{p.name}</h3>
                      <p className="text-xs text-white/55 mt-0.5">{p.tagline}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-white/35 line-through">₹{Math.round(p.total_value)}</div>
                      <div className="text-xl font-bold text-gold">₹{Math.round(p.package_price)}</div>
                      {p.discount_pct > 0 && <div className="text-[10px] text-emerald-300">{p.discount_pct}% off</div>}
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
              ))}
            </div>
          </div>
        )}
        {step === 0 && <FeaturedReviews featured={featured} />}
        {step < 5 && <Stepper step={step} labels={salon.business_type === "restaurant" ? RESTO_LABELS : STEP_LABELS} />}

        {step === 0 && <ServicesStep byCategory={byCategory} picked={picked} onToggle={toggleService} catImages={catImages} catOrder={catOrder} />}
        {step === 1 && <StaffStep staff={staff} staffId={staffId} onPick={setStaffId} date={date} />}
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
            <VerifiedTeam staff={staff} />
            {salon.show_products !== false && <MiracurlProductsStrip compact />}
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
        </div>
      </footer>
      <InstallAppPrompt />
      <BookingChatWidget slug={slug} />
    </div>
  );
}

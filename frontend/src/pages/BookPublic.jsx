import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Scissors, Check, ArrowRight, ArrowLeft, Clock, IndianRupee, Calendar, Phone as PhoneIcon, MapPin, Star, Instagram, MessageCircle, Sparkles } from "lucide-react";
import { toast, Toaster } from "sonner";
import { FeaturedReviews, ServicesStep, StaffStep, DateTimeStep, DetailsStep, ConfirmStep, SuccessStep } from "./BookPublic.steps";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import BookingChatWidget from "@/components/BookingChatWidget";
import { HeroCTAs, GalleryShowcase, VerifiedTeam, ReferEarnBanner, AITrustStrip, LocationsSection, openMira } from "@/components/BookPublicExtras";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const DEFAULT_SLUG = "miracurl-marathahalli";
const TOASTER_STYLE = { background: '#121212', color: '#fff', border: '1px solid rgba(212,175,55,0.3)' };
const TOASTER_OPTIONS = { style: TOASTER_STYLE };
const STEP_LABELS = ["Services", "Stylist", "Date & Time", "Your Details", "Confirm"];
const INITIAL_FORM = { name: "", phone: "", email: "", notes: "", referral_code: "", coupon_code: "", gender: "Female" };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

function Stepper({ step }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 mb-10 overflow-x-auto pb-2">
      {STEP_LABELS.map((l, i) => {
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
            {i < STEP_LABELS.length - 1 && <div className={`w-6 sm:w-10 h-px ${done ? "bg-gold" : "bg-white/10"}`} />}
          </div>
        );
      })}
    </div>
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
  const [salon, setSalon] = useState(null);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [busy, setBusy] = useState(false);

  const [picked, setPicked] = useState([]);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(tomorrow);
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
    PUBLIC.get(`/staff/${slug}`).then(r => setStaff(r.data)).catch(() => setStaff([]));
    PUBLIC.get(`/reviews/featured/${slug}`).then(r => setFeatured(r.data)).catch(() => setFeatured([]));
    PUBLIC.get(`/gallery/${slug}`).then(r => setGallery(r.data)).catch(() => setGallery([]));
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

  const handleFormChange = useCallback(next => {
    setReferralCheck(prev => (next.referral_code !== form.referral_code ? null : prev));
    setCouponCheck(prev => (next.coupon_code !== form.coupon_code ? null : prev));
    setForm(next);
  }, [form.referral_code, form.coupon_code]);

  function next() {
    if (step === 0 && picked.length === 0) { toast.error("Please pick at least one service"); return; }
    if (step === 2 && !time) { toast.error("Pick a time slot"); return; }
    if (step === 3) {
      if (!form.name.trim()) { toast.error("Name is required"); return; }
      if (!/^\d{7,15}$/.test(form.phone.trim())) { toast.error("Enter a valid phone number"); return; }
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
              <div className="text-[10px] tracking-[0.3em] uppercase text-gold">Book Your Visit</div>
            </div>
          </div>
          <h1 className="font-playfair text-3xl sm:text-5xl leading-tight max-w-2xl">{salon.tagline}.</h1>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-white/60">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gold" /> {salon.location}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-gold" /> {salon.hours}</span>
            <span className="flex items-center gap-1"><PhoneIcon className="w-3 h-3 text-gold" /> {salon.phone}</span>
          </div>
          <HeroCTAs />
        </div>
      </header>

      <main id="booking-wizard" className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {step === 0 && <FeaturedReviews featured={featured} />}
        {step < 5 && <Stepper step={step} />}

        {step === 0 && <ServicesStep byCategory={byCategory} picked={picked} onToggle={toggleService} />}
        {step === 1 && <StaffStep staff={staff} staffId={staffId} onPick={setStaffId} />}
        {step === 2 && <DateTimeStep date={date} time={time} onDate={setDate} onTime={setTime} availability={availability} />}
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
            <GalleryShowcase items={gallery} />
            <VerifiedTeam staff={staff} />
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
            <a
              href={`tel:${salon.phone.replace(/\s/g, "")}`}
              data-testid="book-phone-link"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-sky-500 text-white shadow-lg hover:scale-105 transition"
              aria-label="Call salon"
              title={salon.phone}
            >
              <PhoneIcon className="w-5 h-5" />
            </a>
          )}
        </div>
        {salon?.google_review_url && (
          <a href={salon.google_review_url} target="_blank" rel="noreferrer" data-testid="book-google-review-link" className="inline-flex items-center gap-2 text-gold hover:text-gold-hover mb-3">
            <Star className="w-3 h-3 fill-gold text-gold" /> Review us on Google
          </a>
        )}
        <div>© Miracurl · Crafted with care in Marathahalli</div>
      </footer>
      <InstallAppPrompt />
      <BookingChatWidget slug={slug} />
    </div>
  );
}

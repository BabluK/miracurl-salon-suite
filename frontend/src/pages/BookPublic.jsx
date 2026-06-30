import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Scissors, Check, ArrowRight, ArrowLeft, Clock, IndianRupee, Calendar, Phone, MapPin, Star } from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  FeaturedReviews,
  ServicesStep,
  StaffStep,
  DateTimeStep,
  DetailsStep,
  ConfirmStep,
  SuccessStep,
} from "./BookPublic.steps";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const DEFAULT_SLUG = "miracurl-marathahalli";
const TOASTER_STYLE = { background: '#121212', color: '#fff', border: '1px solid rgba(212,175,55,0.3)' };
const TOASTER_OPTIONS = { style: TOASTER_STYLE };
const STEP_LABELS = ["Services", "Stylist", "Date & Time", "Your Details", "Confirm"];
const INITIAL_FORM = { name: "", phone: "", email: "", notes: "", referral_code: "" };
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
  const [busy, setBusy] = useState(false);

  const [picked, setPicked] = useState([]);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [referralCheck, setReferralCheck] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    PUBLIC.get(`/salon/${slug}`).then(r => setSalon(r.data)).catch(() => setSalon({ error: true }));
    PUBLIC.get(`/services/${slug}`).then(r => setServices(r.data)).catch(() => setServices([]));
    PUBLIC.get(`/staff/${slug}`).then(r => setStaff(r.data)).catch(() => setStaff([]));
    PUBLIC.get(`/reviews/featured/${slug}`).then(r => setFeatured(r.data)).catch(() => setFeatured([]));
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
    setForm(next);
  }, [form.referral_code]);

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

  async function submit() {
    setBusy(true);
    try {
      const scheduled = `${date}T${time}:00+05:30`;
      const { data } = await PUBLIC.post(`/book/${slug}`, {
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim(),
        customer_email: form.email.trim() || null,
        service_ids: picked,
        staff_id: staffId || null,
        scheduled_at: scheduled,
        notes: form.notes || null,
        referral_code: form.referral_code.trim().toUpperCase() || null,
      });
      setConfirmation(data);
      setStep(5);
      toast.success("Booking confirmed!");
    } catch (e) {
      toast.error(describeBookingError(e));
    } finally { setBusy(false); }
  }

  function bookAnother() {
    setStep(0); setPicked([]); setTime(""); setReferralCheck(null);
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
    <div className="min-h-screen bg-bg-base text-ink-primary" data-testid="public-book-page">
      <Toaster theme="dark" position="top-center" toastOptions={TOASTER_OPTIONS} />

      <header className="relative h-64 sm:h-80 overflow-hidden">
        <img src={salon.hero_image} className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-bg-base" />
        <div className="relative z-10 max-w-5xl mx-auto h-full flex flex-col justify-end p-6 sm:p-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full bg-gold flex items-center justify-center shadow-gold-glow">
              <Scissors className="w-5 h-5 text-bg-base" />
            </div>
            <div>
              <div className="font-playfair text-2xl">Miracurl</div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gold">Book Your Visit</div>
            </div>
          </div>
          <h1 className="font-playfair text-3xl sm:text-5xl leading-tight max-w-2xl">{salon.tagline}.</h1>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-white/60">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gold" /> {salon.location}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-gold" /> {salon.hours}</span>
            <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gold" /> {salon.phone}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {step === 0 && <FeaturedReviews featured={featured} />}
        {step < 5 && <Stepper step={step} />}

        {step === 0 && <ServicesStep byCategory={byCategory} picked={picked} onToggle={toggleService} />}
        {step === 1 && <StaffStep staff={staff} staffId={staffId} onPick={setStaffId} />}
        {step === 2 && <DateTimeStep date={date} time={time} onDate={setDate} onTime={setTime} />}
        {step === 3 && <DetailsStep form={form} onChange={handleFormChange} referralCheck={referralCheck} onCheckReferral={checkReferral} />}
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
      </main>

      <footer className="border-t border-white/5 mt-10 py-8 text-center text-xs text-ink-muted">
        {salon?.google_review_url && (
          <a href={salon.google_review_url} target="_blank" rel="noreferrer" data-testid="book-google-review-link" className="inline-flex items-center gap-2 text-gold hover:text-gold-hover mb-3">
            <Star className="w-3 h-3 fill-gold text-gold" /> Review us on Google
          </a>
        )}
        <div>© Miracurl · Crafted with care in Marathahalli</div>
      </footer>
    </div>
  );
}

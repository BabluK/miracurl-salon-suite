import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Scissors, Check, ArrowRight, ArrowLeft, Clock, IndianRupee, Calendar, Phone, User, Mail, Sparkles, MapPin, Gift, Share2, Copy, Star } from "lucide-react";
import { toast, Toaster } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const PUBLIC = axios.create({ baseURL: `${BACKEND_URL}/api/public` });

const TIME_SLOTS = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30",
];

function Stepper({ step }) {
  const labels = ["Services", "Stylist", "Date & Time", "Your Details", "Confirm"];
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

export default function BookPublic() {
  const [step, setStep] = useState(0);
  const [salon, setSalon] = useState(null);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [busy, setBusy] = useState(false);

  // selections
  const [picked, setPicked] = useState([]); // service ids
  const [staffId, setStaffId] = useState(""); // "" = any
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "", referral_code: "" });
  const [referralCheck, setReferralCheck] = useState(null); // {valid, referrer_name} | {error}
  const [confirmation, setConfirmation] = useState(null);
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    PUBLIC.get("/salon").then(r => setSalon(r.data));
    PUBLIC.get("/services").then(r => setServices(r.data));
    PUBLIC.get("/staff").then(r => setStaff(r.data));
    PUBLIC.get("/reviews/featured").then(r => setFeatured(r.data)).catch(() => setFeatured([]));
  }, []);

  const byCategory = useMemo(() => services.reduce((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {}), [services]);

  const pickedServices = services.filter(s => picked.includes(s.id));
  const total = pickedServices.reduce((a, s) => a + s.price, 0);
  const duration = pickedServices.reduce((a, s) => a + s.duration_min, 0);

  function toggleService(id) {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

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

  async function checkReferral() {
    const code = form.referral_code.trim().toUpperCase();
    if (!code) { setReferralCheck(null); return; }
    try {
      const { data } = await PUBLIC.get(`/referral/${encodeURIComponent(code)}`);
      setReferralCheck({ valid: true, ...data });
    } catch (e) {
      setReferralCheck({ valid: false, error: e.response?.data?.detail || "Invalid code" });
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const scheduled = `${date}T${time}:00+05:30`;
      const { data } = await PUBLIC.post("/book", {
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
      const detail = e.response?.data?.detail;
      const msg = typeof detail === "string" ? detail
        : Array.isArray(detail) ? detail.map(x => x.msg || JSON.stringify(x)).join(" · ")
        : "Booking failed";
      toast.error(msg);
    } finally { setBusy(false); }
  }

  if (!salon) return <div className="min-h-screen flex items-center justify-center bg-bg-base text-gold font-playfair text-2xl animate-pulse">Miracurl</div>;

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary" data-testid="public-book-page">
      <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: '#121212', color: '#fff', border: '1px solid rgba(212,175,55,0.3)' } }} />

      {/* Hero */}
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
        {/* Featured reviews strip — social proof */}
        {step === 0 && featured.length > 0 && (
          <section className="mb-10" data-testid="featured-reviews">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => <Star key={n} className="w-4 h-4 fill-gold text-gold" />)}
              </div>
              <span className="text-sm text-ink-secondary">Loved by our guests</span>
              <div className="h-px bg-white/10 flex-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {featured.slice(0, 3).map((r, idx) => (
                <div key={idx} className="card-luxe text-sm">
                  <div className="flex items-center gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? "fill-gold text-gold" : "text-white/15"}`} />
                    ))}
                  </div>
                  {r.comment && <p className="italic text-ink-secondary line-clamp-3">&ldquo;{r.comment}&rdquo;</p>}
                  <div className="mt-3 pt-3 border-t border-white/5 text-xs text-ink-muted">
                    — {r.customer_name}{r.staff_name && <> · with {r.staff_name}</>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {step < 5 && <Stepper step={step} />}

        {/* STEP 0 — Services */}
        {step === 0 && (
          <section className="space-y-8 animate-fade-up">
            <div>
              <h2 className="font-playfair text-3xl">Choose your services</h2>
              <p className="text-ink-secondary text-sm mt-1">Pick one or more — we&apos;ll add up the total for you.</p>
            </div>
            {Object.keys(byCategory).map(cat => (
              <div key={cat}>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-playfair text-xl text-gold">{cat}</h3>
                  <div className="h-px bg-white/10 flex-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {byCategory[cat].map(s => {
                    const on = picked.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        data-testid={`book-service-${s.id}`}
                        onClick={() => toggleService(s.id)}
                        className={`text-left card-luxe p-0 overflow-hidden transition-all ${on ? "border-gold ring-2 ring-gold/30 shadow-gold-glow" : "hover:border-gold/40"}`}
                      >
                        <div className="h-28 relative">
                          <img src={s.image_url || "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400"} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-bg-surface to-transparent" />
                          {s.trending && <span className="absolute top-2 left-2 bg-gold text-bg-base text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">Trending</span>}
                          {on && <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gold flex items-center justify-center"><Check className="w-3.5 h-3.5 text-bg-base" /></span>}
                        </div>
                        <div className="p-4">
                          <div className="font-playfair text-lg">{s.name}</div>
                          {s.description && <div className="text-xs text-ink-secondary mt-1 line-clamp-2">{s.description}</div>}
                          <div className="flex items-center justify-between mt-3 text-sm">
                            <span className="text-gold font-semibold flex items-center"><IndianRupee className="w-3 h-3" />{s.price}</span>
                            <span className="text-ink-secondary text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration_min}m</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* STEP 1 — Stylist */}
        {step === 1 && (
          <section className="space-y-6 animate-fade-up">
            <div>
              <h2 className="font-playfair text-3xl">Choose your stylist</h2>
              <p className="text-ink-secondary text-sm mt-1">Have a favourite? Pick them. Or let us assign the best fit.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                data-testid="book-staff-any"
                onClick={() => setStaffId("")}
                className={`card-luxe text-center transition-all ${staffId === "" ? "border-gold ring-2 ring-gold/30" : "hover:border-gold/40"}`}
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gold/30 to-blush/20 mx-auto flex items-center justify-center border-2 border-gold/40">
                  <Sparkles className="w-8 h-8 text-gold" />
                </div>
                <div className="font-playfair text-xl mt-3">Any Stylist</div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold mt-1">We choose</p>
                <p className="text-xs text-ink-secondary mt-2">First available expert</p>
              </button>
              {staff.map(s => (
                <button
                  key={s.id}
                  data-testid={`book-staff-${s.id}`}
                  onClick={() => setStaffId(s.id)}
                  className={`card-luxe text-center transition-all ${staffId === s.id ? "border-gold ring-2 ring-gold/30" : "hover:border-gold/40"}`}
                >
                  <img src={s.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"} className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-gold/40" alt={s.name} />
                  <div className="font-playfair text-xl mt-3">{s.name}</div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold mt-1">{s.role}</p>
                  <div className="flex flex-wrap gap-1 justify-center mt-2">
                    {(s.specialties || []).slice(0, 3).map(sp => (
                      <span key={sp} className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded">{sp}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* STEP 2 — Date & Time */}
        {step === 2 && (
          <section className="space-y-6 animate-fade-up">
            <div>
              <h2 className="font-playfair text-3xl">When would you like to come?</h2>
              <p className="text-ink-secondary text-sm mt-1">Pick a date and a comfortable time slot.</p>
            </div>
            <div className="card-luxe max-w-md">
              <label className="label-luxe block mb-2">Date</label>
              <input
                data-testid="book-date-input"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                className="input-luxe"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <div className="label-luxe mb-3">Available Time Slots</div>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                {TIME_SLOTS.map(t => (
                  <button
                    key={t}
                    data-testid={`book-time-${t}`}
                    onClick={() => setTime(t)}
                    className={`py-2.5 rounded-md text-sm font-mono transition-all ${
                      time === t ? "bg-gold text-bg-base font-semibold shadow-gold-glow" :
                      "bg-white/5 border border-white/10 text-white/70 hover:border-gold/40 hover:text-white"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* STEP 3 — Details */}
        {step === 3 && (
          <section className="space-y-6 animate-fade-up max-w-xl">
            <div>
              <h2 className="font-playfair text-3xl">Your details</h2>
              <p className="text-ink-secondary text-sm mt-1">So we can send you a confirmation and reminder.</p>
            </div>
            <div className="card-luxe space-y-4">
              <div>
                <label className="label-luxe block mb-1">Full Name *</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input data-testid="book-name-input" required className="input-luxe pl-10" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
                </div>
              </div>
              <div>
                <label className="label-luxe block mb-1">Phone *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input data-testid="book-phone-input" required className="input-luxe pl-10" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="98765 43210" />
                </div>
              </div>
              <div>
                <label className="label-luxe block mb-1">Email (optional)</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input data-testid="book-email-input" type="email" className="input-luxe pl-10" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
                </div>
              </div>
              <div>
                <label className="label-luxe block mb-1">Notes (optional)</label>
                <textarea data-testid="book-notes-input" rows="3" className="input-luxe" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Anything we should know?" />
              </div>
              <div className="pt-2 border-t border-white/5">
                <label className="label-luxe block mb-1 flex items-center gap-2"><Gift className="w-3 h-3 text-gold" /> Referral code (optional)</label>
                <div className="flex gap-2">
                  <input
                    data-testid="book-referral-input"
                    className="input-luxe uppercase tracking-widest"
                    value={form.referral_code}
                    onChange={e => { setForm({ ...form, referral_code: e.target.value.toUpperCase() }); setReferralCheck(null); }}
                    onBlur={checkReferral}
                    placeholder="MIRACURL01"
                  />
                  <button type="button" data-testid="book-referral-check-btn" onClick={checkReferral} className="btn-ghost text-xs px-3">Check</button>
                </div>
                {referralCheck?.valid && (
                  <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1" data-testid="book-referral-valid">
                    <Check className="w-3 h-3" /> Referred by {referralCheck.referrer_name} · You&apos;ll get ₹{referralCheck.reward_referred} off your first bill
                  </div>
                )}
                {referralCheck?.valid === false && (
                  <div className="mt-2 text-xs text-red-400" data-testid="book-referral-invalid">{referralCheck.error}</div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* STEP 4 — Confirm */}
        {step === 4 && (
          <section className="space-y-6 animate-fade-up max-w-2xl">
            <div>
              <h2 className="font-playfair text-3xl">Review & confirm</h2>
              <p className="text-ink-secondary text-sm mt-1">Tap confirm to lock in your appointment.</p>
            </div>
            <div className="card-luxe space-y-4">
              <div>
                <div className="label-luxe">Services</div>
                <ul className="mt-2 space-y-2">
                  {pickedServices.map(s => (
                    <li key={s.id} className="flex justify-between text-sm">
                      <span>{s.name} <span className="text-ink-muted text-xs">· {s.duration_min}m</span></span>
                      <span className="text-gold">₹{s.price}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-white/10 pt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="label-luxe">Stylist</div>
                  <div className="mt-1">{staffId ? (staff.find(s => s.id === staffId)?.name || "—") : "Any available"}</div>
                </div>
                <div>
                  <div className="label-luxe">When</div>
                  <div className="mt-1">{new Date(`${date}T${time}`).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div>
                  <div className="label-luxe">Name</div>
                  <div className="mt-1">{form.name}</div>
                </div>
                <div>
                  <div className="label-luxe">Phone</div>
                  <div className="mt-1">{form.phone}</div>
                </div>
              </div>
              <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                <span className="text-ink-secondary text-sm">Estimated total · {duration}m</span>
                <span className="font-playfair text-3xl text-gold flex items-center"><IndianRupee className="w-5 h-5" />{total}</span>
              </div>
            </div>
          </section>
        )}

        {/* STEP 5 — Success */}
        {step === 5 && confirmation && (
          <section className="max-w-2xl mx-auto text-center animate-fade-up py-10" data-testid="book-success">
            <div className="w-20 h-20 mx-auto rounded-full bg-gold flex items-center justify-center shadow-gold-glow mb-6">
              <Check className="w-10 h-10 text-bg-base" />
            </div>
            <h2 className="font-playfair text-4xl">You&apos;re booked ✦</h2>
            <p className="text-ink-secondary mt-3">A confirmation has been recorded. See you soon at Miracurl.</p>

            {confirmation.referral_applied && (
              <div className="card-luxe mt-6 bg-gold/5 border-gold/30" data-testid="book-referral-applied">
                <div className="flex items-center gap-2 justify-center text-gold">
                  <Gift className="w-5 h-5" />
                  <span className="font-playfair text-lg">₹{confirmation.referral_applied.credit_added} credit added!</span>
                </div>
                <p className="text-xs text-ink-secondary mt-1">Thanks for using {confirmation.referral_applied.referrer_name}&apos;s referral code. Your credit auto-applies on your next bill.</p>
              </div>
            )}

            <div className="card-luxe mt-8 text-left">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><div className="label-luxe">Name</div><div className="mt-1">{confirmation.summary.customer_name}</div></div>
                <div><div className="label-luxe">Stylist</div><div className="mt-1">{confirmation.summary.staff_name}</div></div>
                <div className="col-span-2"><div className="label-luxe">Services</div><div className="mt-1">{confirmation.summary.service_names.join(", ")}</div></div>
                <div><div className="label-luxe">When</div><div className="mt-1">{new Date(confirmation.summary.scheduled_at).toLocaleString()}</div></div>
                <div><div className="label-luxe">Total</div><div className="mt-1 text-gold font-playfair text-xl flex items-center"><IndianRupee className="w-4 h-4" />{confirmation.summary.total}</div></div>
              </div>
            </div>

            {/* Refer-a-friend card */}
            <div className="card-luxe mt-6 bg-gradient-to-br from-gold/10 via-bg-surface to-blush/5 border-gold/30 text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center shadow-gold-glow">
                  <Gift className="w-5 h-5 text-bg-base" />
                </div>
                <div>
                  <h3 className="font-playfair text-xl">Share & earn ₹100</h3>
                  <p className="text-xs text-ink-secondary">Refer a friend — both of you get ₹100 off your next visit.</p>
                </div>
              </div>
              <div className="bg-bg-base/60 border border-white/10 rounded-md p-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="label-luxe">Your Referral Code</div>
                  <div className="font-playfair text-2xl text-gold tracking-widest mt-1" data-testid="user-referral-code">{confirmation.summary.customer_referral_code}</div>
                </div>
                <button
                  data-testid="copy-referral-code-btn"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(confirmation.summary.customer_referral_code); toast.success("Code copied!"); }
                    catch { toast.error("Copy not available. Long-press to copy."); }
                  }}
                  className="btn-ghost text-xs px-3 py-2 flex items-center gap-1"
                ><Copy className="w-3 h-3" /> Copy</button>
                <a
                  data-testid="share-whatsapp-btn"
                  href={`https://wa.me/?text=${encodeURIComponent(`I just booked at Miracurl ✦ — try them out! Use my referral code ${confirmation.summary.customer_referral_code} and get ₹100 off. Book here: ${window.location.origin}/book`)}`}
                  target="_blank" rel="noreferrer"
                  className="btn-gold text-xs px-3 py-2 flex items-center gap-1"
                ><Share2 className="w-3 h-3" /> WhatsApp</a>
              </div>
            </div>

            <button
              onClick={() => {
                setStep(0); setPicked([]); setTime(""); setReferralCheck(null);
                setForm({ name: "", phone: "", email: "", notes: "", referral_code: "" });
                setConfirmation(null);
              }}
              className="btn-ghost mt-8"
              data-testid="book-another-btn"
            >
              Book another visit
            </button>
          </section>
        )}

        {/* Footer nav */}
        {step < 5 && (
          <div className="mt-10 flex items-center justify-between gap-4 sticky bottom-0 py-4 bg-bg-base/90 backdrop-blur-xl border-t border-white/5 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <button
              data-testid="book-back-btn"
              onClick={back}
              disabled={step === 0}
              className="btn-ghost flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
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
          <a
            href={salon.google_review_url}
            target="_blank"
            rel="noreferrer"
            data-testid="book-google-review-link"
            className="inline-flex items-center gap-2 text-gold hover:text-gold-hover mb-3"
          >
            <Star className="w-3 h-3 fill-gold text-gold" /> Review us on Google
          </a>
        )}
        <div>© Miracurl · Crafted with care in Marathahalli</div>
      </footer>
    </div>
  );
}

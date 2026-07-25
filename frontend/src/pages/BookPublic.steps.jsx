// Step components for the public booking page.
// Extracted from BookPublic.jsx to reduce that file's complexity (was 549 lines).
// Each component is a pure presentational unit driven by props.
import { Check, IndianRupee, Clock, Sparkles, User, Phone, Mail, Gift, Star, Copy, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { shareText as shareTextLib } from "@/lib/share";
import { catImage } from "@/lib/categoryImages";

const CATEGORY_ORDER = ["Skin", "Manicure", "Pedicure", "Men Hair", "Women Hair", "Makeup", "Nails"];

export const TIME_SLOTS = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30",
];

const STAR_NUMS = [1, 2, 3, 4, 5];
const DEFAULT_STAFF_IMG = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300";

export function FeaturedReviews({ featured }) {
  if (!featured?.length) return null;
  return (
    <section className="mb-10" data-testid="featured-reviews">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          {STAR_NUMS.map(n => <Star key={n} className="w-4 h-4 fill-gold text-gold" />)}
        </div>
        <span className="text-sm text-ink-secondary">Loved by our guests</span>
        <div className="h-px bg-white/10 flex-1" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {featured.slice(0, 3).map((r, idx) => (
          <div key={r.id || `featured-${idx}`} className="card-luxe text-sm">
            <div className="flex items-center gap-0.5 mb-2">
              {STAR_NUMS.map(n => (
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
  );
}

export function ServicesStep({ byCategory, picked, onToggle, catImages = {}, catOrder = [] }) {
  const [gender, setGender] = useState("All");
  const genderOf = (s) => s.gender || "unisex";
  const visible = (s) =>
    gender === "All" ||
    (gender === "Women" && genderOf(s) !== "men") ||
    (gender === "Men" && genderOf(s) !== "women");
  const cats = useMemo(() => {
    const has = (c) => (byCategory[c] || []).some(visible);
    const baseOrder = catOrder.length ? catOrder : CATEGORY_ORDER;
    const known = baseOrder.filter((c) => has(c));
    const extra = Object.keys(byCategory).filter((c) => !known.includes(c) && has(c)).sort();
    return [...known, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byCategory, gender, catOrder]);
  const [active, setActive] = useState("All");
  const shown = active === "All" ? cats : cats.filter((c) => c === active);

  return (
    <section className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-playfair text-3xl">Choose your services</h2>
          <p className="text-ink-secondary text-sm mt-1">Pick one or more — we&apos;ll add up the total for you.</p>
        </div>
        <div className="flex rounded-full bg-white/5 border border-white/10 p-1" data-testid="book-gender-toggle">
          {["All", "Women", "Men"].map((g) => (
            <button
              key={g}
              data-testid={`book-gender-${g.toLowerCase()}`}
              onClick={() => { setGender(g); setActive("All"); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                gender === g ? "bg-gold text-bg-base shadow-gold-glow" : "text-white/60 hover:text-white"
              }`}
            >
              {g === "All" ? "Everyone" : g}
            </button>
          ))}
        </div>
      </div>

      {/* Main category tabs */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-bg-base/85 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto no-scrollbar" data-testid="book-category-tabs">
          {["All", ...cats].map((c) => (
            <button
              key={c}
              data-testid={`book-cat-pill-${c.replace(/\s+/g, "-").toLowerCase()}`}
              onClick={() => setActive(c)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-colors ${
                active === c
                  ? "bg-gold text-bg-base shadow-gold-glow"
                  : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-gold/40"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {shown.map(cat => {
        const rows = (byCategory[cat] || []).filter(visible);
        return (
          <div key={cat} className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03]" data-testid={`book-cat-section-${cat.replace(/\s+/g, "-").toLowerCase()}`}>
            {/* Category banner — one elegant image per category */}
            <div className="relative h-24 sm:h-28 flex items-stretch overflow-hidden">
              <div
                className="flex-1 relative flex items-center pl-5 sm:pl-7"
                style={{
                  background:
                    "repeating-linear-gradient(115deg, rgba(212,175,55,0.10) 0px, rgba(212,175,55,0.10) 1px, transparent 1px, transparent 26px), linear-gradient(100deg, #1d1812 0%, #262016 70%, #1d1812 100%)",
                }}
              >
                <div>
                  <h3 className="font-playfair text-2xl sm:text-3xl text-gold">{cat}</h3>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/45 mt-1">{rows.length} services</div>
                </div>
              </div>
              <div className="w-[42%] sm:w-[38%] relative shrink-0">
                <img src={catImage(cat, catImages)} alt={cat} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#1d1812] via-transparent to-transparent" />
              </div>
            </div>
            {/* Compact service rows — no per-service photos needed */}
            <div className="divide-y divide-white/5">
              {rows.map(s => {
                const on = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    data-testid={`book-service-${s.id}`}
                    onClick={() => onToggle(s.id)}
                    className={`w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3.5 transition-colors ${on ? "bg-gold/10" : "hover:bg-white/[0.04]"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[15px]">{s.name}</span>
                        {s.trending && <span className="bg-gold text-bg-base text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">Trending</span>}
                      </div>
                      <div className="text-ink-secondary text-xs flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration_min}m</span>
                        {s.description && <span className="truncate hidden sm:inline">· {s.description}</span>}
                      </div>
                    </div>
                    <span className="text-gold font-bold text-base flex items-center shrink-0"><IndianRupee className="w-3.5 h-3.5" />{s.price}</span>
                    <span className={`text-xs font-semibold px-4 py-1.5 rounded-lg border transition-colors shrink-0 flex items-center gap-1.5 ${on ? "bg-gold text-bg-base border-gold" : "border-gold/60 text-gold"}`}>
                      {on && <Check className="w-3.5 h-3.5" />}{on ? "Selected" : "Select"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function StaffStep({ staff, staffId, onPick }) {
  return (
    <section className="space-y-6 animate-fade-up">
      <div>
        <h2 className="font-playfair text-3xl">Choose your stylist</h2>
        <p className="text-ink-secondary text-sm mt-1">Have a favourite? Pick them. Or let us assign the best fit.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          data-testid="book-staff-any"
          onClick={() => onPick("")}
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
            onClick={() => onPick(s.id)}
            className={`card-luxe text-center transition-all ${staffId === s.id ? "border-gold ring-2 ring-gold/30" : "hover:border-gold/40"}`}
          >
            <img src={s.image_url || DEFAULT_STAFF_IMG} className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-gold/40" alt={s.name} />
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
  );
}

export function DateTimeStep({ date, time, onDate, onTime, availability }) {
  const minDate = new Date().toISOString().slice(0, 10);
  const slots = availability?.slots || {};
  return (
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
          min={minDate}
          className="input-luxe"
          value={date}
          onChange={e => onDate(e.target.value)}
        />
      </div>
      <div>
        <div className="label-luxe mb-3">Available Time Slots</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
          {TIME_SLOTS.map(t => {
            const full = availability && slots[t] === false;
            return (
              <button
                key={t}
                data-testid={`book-time-${t}`}
                onClick={() => !full && onTime(t)}
                disabled={full}
                title={full ? "Fully booked" : undefined}
                className={`py-2.5 rounded-md text-sm font-mono transition-all ${
                  full ? "bg-white/[0.02] border border-white/5 text-white/20 line-through cursor-not-allowed" :
                  time === t ? "bg-gold text-bg-base font-semibold shadow-gold-glow" :
                  "bg-white/5 border border-white/10 text-white/70 hover:border-gold/40 hover:text-white"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        {availability && Object.values(slots).every(v => v === false) && (
          <p className="text-xs text-amber-400 mt-3" data-testid="book-day-full-note">All slots are booked for this day — please pick another date 🙏</p>
        )}
      </div>
    </section>
  );
}

export function DetailsStep({ form, onChange, referralCheck, onCheckReferral, couponCheck, onCheckCoupon }) {
  return (
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
            <input data-testid="book-name-input" required className="input-luxe pl-10" value={form.name}
              onChange={e => onChange({ ...form, name: e.target.value.replace(/[^A-Za-z .'-]/g, "") })} placeholder="Your name" maxLength={80} />
          </div>
        </div>
        <div>
          <label className="label-luxe block mb-1">Phone *</label>
          <div className="relative">
            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input data-testid="book-phone-input" required type="tel" inputMode="numeric" className="input-luxe pl-10" value={form.phone}
              onChange={e => onChange({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile number" maxLength={10} />
          </div>
        </div>
        <div>
          <label className="label-luxe block mb-1">Gender</label>
          <div className="flex gap-2" data-testid="book-gender-select">
            {["Female", "Male", "Other"].map((g) => (
              <button
                key={g}
                type="button"
                data-testid={`book-detail-gender-${g.toLowerCase()}`}
                onClick={() => onChange({ ...form, gender: g })}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  form.gender === g ? "bg-gold text-bg-base border-gold" : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label-luxe block mb-1">Email (optional)</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input data-testid="book-email-input" type="email" className="input-luxe pl-10" value={form.email} onChange={e => onChange({ ...form, email: e.target.value })} placeholder="you@example.com" />
          </div>
        </div>
        <div>
          <label className="label-luxe block mb-1">Notes (optional)</label>
          <textarea data-testid="book-notes-input" rows="3" className="input-luxe" value={form.notes} onChange={e => onChange({ ...form, notes: e.target.value })} placeholder="Anything we should know?" />
        </div>
        <ReferralRow form={form} onChange={onChange} referralCheck={referralCheck} onCheckReferral={onCheckReferral} />
        <CouponRow form={form} onChange={onChange} couponCheck={couponCheck} onCheckCoupon={onCheckCoupon} />
      </div>
    </section>
  );
}

function CouponRow({ form, onChange, couponCheck, onCheckCoupon }) {
  return (
    <div className="pt-2 border-t border-white/5">
      <label className="label-luxe block mb-1 flex items-center gap-2"><Gift className="w-3 h-3 text-gold" /> Coupon code (optional)</label>
      <div className="flex gap-2">
        <input
          data-testid="book-coupon-input"
          className="input-luxe uppercase tracking-widest"
          value={form.coupon_code || ""}
          onChange={e => onChange({ ...form, coupon_code: e.target.value.toUpperCase() })}
          onBlur={onCheckCoupon}
          placeholder="FESTIVE20"
        />
        <button type="button" data-testid="book-coupon-check-btn" onClick={onCheckCoupon} className="btn-ghost text-xs px-3">Apply</button>
      </div>
      {couponCheck?.valid && (
        <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1" data-testid="book-coupon-valid">
          <Check className="w-3 h-3" /> {couponCheck.code} applied — {couponCheck.type === "percent" ? `${couponCheck.value}% off` : `₹${couponCheck.value} off`} your bill
        </div>
      )}
      {couponCheck?.valid === false && (
        <div className="mt-2 text-xs text-red-400" data-testid="book-coupon-invalid">{couponCheck.error}</div>
      )}
    </div>
  );
}

function ReferralRow({ form, onChange, referralCheck, onCheckReferral }) {
  return (
    <div className="pt-2 border-t border-white/5">
      <label className="label-luxe block mb-1 flex items-center gap-2"><Gift className="w-3 h-3 text-gold" /> Referral code (optional)</label>
      <div className="flex gap-2">
        <input
          data-testid="book-referral-input"
          className="input-luxe uppercase tracking-widest"
          value={form.referral_code}
          onChange={e => onChange({ ...form, referral_code: e.target.value.toUpperCase() })}
          onBlur={onCheckReferral}
          placeholder="MIRACURL01"
        />
        <button type="button" data-testid="book-referral-check-btn" onClick={onCheckReferral} className="btn-ghost text-xs px-3">Check</button>
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
  );
}

export function ConfirmStep({ pickedServices, staff, staffId, date, time, form, total, duration }) {
  const stylistName = staffId ? (staff.find(s => s.id === staffId)?.name || "—") : "Any available";
  const whenLabel = new Date(`${date}T${time}`).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
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
          <div><div className="label-luxe">Stylist</div><div className="mt-1">{stylistName}</div></div>
          <div><div className="label-luxe">When</div><div className="mt-1">{whenLabel}</div></div>
          <div><div className="label-luxe">Name</div><div className="mt-1">{form.name}</div></div>
          <div><div className="label-luxe">Phone</div><div className="mt-1">{form.phone}</div></div>
        </div>
        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-ink-secondary text-sm">Estimated total · {duration}m</span>
          <span className="font-playfair text-3xl text-gold flex items-center"><IndianRupee className="w-5 h-5" />{total}</span>
        </div>
      </div>
    </section>
  );
}

async function copyReferralCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success("Code copied!");
  } catch {
    toast.error("Copy not available. Long-press to copy.");
  }
}

export function SuccessStep({ confirmation, onBookAnother }) {
  if (!confirmation) return null;
  const code = confirmation.summary.customer_referral_code;
  const shareText = `I just booked at Miracurl ✦ — try them out! Use my referral code ${code} and get ₹100 off. Book here: ${window.location.origin}/book`;
  const onShareReferral = (payload) => shareTextLib(payload);
  return (
    <section className="max-w-2xl mx-auto text-center animate-fade-up py-10" data-testid="book-success">
      <div className="w-20 h-20 mx-auto rounded-full bg-gold flex items-center justify-center shadow-gold-glow mb-6">
        <Check className="w-10 h-10 text-bg-base" />
      </div>
      <h2 className="font-playfair text-4xl">You&apos;re booked ✦</h2>
      <p className="text-ink-secondary mt-3">A confirmation has been recorded. See you soon at Miracurl.</p>

      <button
        data-testid="book-whatsapp-confirm-btn"
        onClick={() => {
          const s = confirmation.summary;
          const when = new Date(s.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
          const txt = encodeURIComponent(
            `✅ Booking Confirmed — Miracurl\n\n👤 ${s.customer_name}\n💇 ${s.service_names.join(", ")}\n🧑‍🎨 Stylist: ${s.staff_name}\n🗓 ${when}\n💰 Total: ₹${s.total}\n\n📍 Book again: ${window.location.origin}${window.location.pathname}`
          );
          window.open(`https://wa.me/?text=${txt}`, "_blank", "noopener,noreferrer");
        }}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#25D366] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Get confirmation on WhatsApp
      </button>

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
            <div className="font-playfair text-2xl text-gold tracking-widest mt-1" data-testid="user-referral-code">{code}</div>
          </div>
          <button
            data-testid="copy-referral-code-btn"
            onClick={() => copyReferralCode(code)}
            className="btn-ghost text-xs px-3 py-2 flex items-center gap-1"
          ><Copy className="w-3 h-3" /> Copy</button>
          <a
            data-testid="share-whatsapp-btn"
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`}
            target="_blank" rel="noopener noreferrer"
            onClick={(e) => {
              // Prefer native share sheet on mobile; the href is a robust fallback.
              if (typeof navigator !== "undefined" && navigator.share) {
                e.preventDefault();
                onShareReferral({
                  title: "Miracurl ✦ — ₹100 off",
                  text: shareText,
                });
              }
            }}
            className="btn-gold text-xs px-3 py-2 flex items-center gap-1"
          ><Share2 className="w-3 h-3" /> Share</a>
        </div>
      </div>

      <button onClick={onBookAnother} className="btn-ghost mt-8" data-testid="book-another-btn">
        Book another visit
      </button>
    </section>
  );
}

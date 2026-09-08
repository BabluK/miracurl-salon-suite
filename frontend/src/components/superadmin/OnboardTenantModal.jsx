import { Building2, CalendarClock, Gift, Loader2, Mail, MapPin, Phone, Scissors, ShieldCheck, Sparkles, User, UtensilsCrossed, X } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";

const lbl = "text-[10px] uppercase tracking-[1.5px] text-slate-400 font-semibold";
const inp = "mt-1.5 w-full h-11 rounded-xl border border-white/10 bg-white/[.04] px-3.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors focus:border-[#d4af37]/70 focus:bg-white/[.06]";
const PLANS = [["starter", "Starter"], ["pro", "Pro"], ["enterprise", "Enterprise"]];
const TRIALS = [[null, "30 days", "Default"], [3, "3 months", ""], [6, "6 months", ""], [9, "9 months", ""], [12, "1 year", "Best value"]];

export function trialEndDate(months) {
  const d = new Date();
  if (months) d.setMonth(d.getMonth() + months); else d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function TrialPicker({ value, onChange }) {
  return (
    <div className="mt-4" data-testid="trial-picker">
      <div className={`${lbl} inline-flex items-center gap-1.5 mb-1.5`}><Gift className="w-3 h-3 text-[#d4af37]" /> Free trial length</div>
      <div className="grid grid-cols-5 gap-2">
        {TRIALS.map(([m, l, tag]) => {
          const on = (value ?? null) === m;
          return (
            <button key={String(m)} type="button" onClick={() => onChange(m)} data-testid={`tenant-trial-${m ?? "default"}`}
              className={`relative h-12 rounded-xl border text-[12.5px] font-semibold transition-all ${on ? "border-[#d4af37] bg-[#d4af37]/15 text-[#F0D9A5] shadow-[0_0_24px_-6px_rgba(212,175,55,.6)]" : "border-white/10 text-slate-400 hover:border-white/25"}`}>
              {l}
              {tag && <span className={`absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full text-[8.5px] uppercase tracking-wider ${on ? "bg-[#d4af37] text-[#15151b]" : "bg-white/10 text-slate-400"}`}>{tag}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-slate-400 inline-flex items-center gap-1.5" data-testid="trial-end-preview">
        <CalendarClock className="w-3.5 h-3.5 text-[#d4af37]" /> Trial runs from today until <span className="text-[#F0D9A5] font-semibold">{trialEndDate(value)}</span> · a ₹0 invoice + Congratulations email go out automatically.
      </div>
    </div>
  );
}

function Section({ n, title, hint, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-extrabold flex items-center justify-center shrink-0">{n}</span>
        <div><div className="text-sm font-semibold text-slate-100">{title}</div>{hint && <div className="text-[11px] text-slate-500">{hint}</div>}</div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, icon: Icon, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className={`${lbl} inline-flex items-center gap-1.5`}>{Icon && <Icon className="w-3 h-3 text-[#d4af37]" />}{label}</span>
      {children}
      {hint && <span className="block text-[10.5px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

export function OnboardTenantModal({ form, setForm, onSave, busy, onClose }) {
  const resto = form.business_type === "restaurant";
  const noun = resto ? "Restaurant" : "Salon";
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6 overflow-y-auto" onClick={onClose} data-testid="onboard-tenant-modal">
      <form onSubmit={onSave} onClick={e => e.stopPropagation()} className="relative w-full max-w-2xl my-auto rounded-3xl bg-[#17171d] border border-[#d4af37]/30 shadow-[0_40px_120px_-30px_rgba(212,175,55,.35)] overflow-hidden">
        <div className="relative px-6 sm:px-8 pt-7 pb-5 bg-gradient-to-br from-[#d4af37]/[.14] via-transparent to-transparent border-b border-white/10">
          <div className="text-[10px] uppercase tracking-[3px] text-[#F0D9A5]/80 font-semibold inline-flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Miracurl HQ · new partner</div>
          <h3 className="font-playfair text-2xl sm:text-3xl text-white mt-1.5">Onboard a New {noun}</h3>
          <p className="text-xs text-slate-400 mt-1">Three quick steps — the owner gets a one-time password and a welcome email the moment you save.</p>
          <button type="button" onClick={onClose} className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center" data-testid="onboard-close"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-4 max-h-[62vh] overflow-y-auto">
          <Section n="1" title="Business" hint="What are we onboarding and how will guests find it?">
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[["salon", "Salon", Scissors], ["restaurant", "Restaurant", UtensilsCrossed]].map(([v, l, Icon]) => {
                const on = (form.business_type || "salon") === v;
                return (
                  <button key={v} type="button" data-testid={`tenant-type-${v}`} onClick={() => setForm({ ...form, business_type: v })}
                    className={`h-12 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all ${on ? "border-[#d4af37] bg-[#d4af37]/15 text-[#F0D9A5] shadow-[0_0_24px_-6px_rgba(212,175,55,.6)]" : "border-white/10 text-slate-400 hover:border-white/25"}`}>
                    <Icon className="w-4 h-4" /> {l}
                  </button>
                );
              })}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={`${noun} name *`} icon={Building2}>
                <input data-testid="tenant-name-input" required className={inp} value={form.name} onChange={set("name")} placeholder={resto ? "Infinity Family Restaurant" : "Elegance Beauty Lounge"} />
              </Field>
              <Field label="Booking slug *" hint={<>Public page: <span className="text-[#F0D9A5] font-mono">/book/{form.slug || "your-slug"}</span></>}>
                <input data-testid="tenant-slug-input" required pattern={"[a-z0-9]([a-z0-9\\-]{1,38}[a-z0-9])?"} className={`${inp} font-mono lowercase`} value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="elegance-koramangala" />
              </Field>
              <Field label="Location" icon={MapPin}>
                <input className={inp} value={form.location} onChange={set("location")} placeholder="Koramangala, Bengaluru" />
              </Field>
              <Field label={`${noun} phone`} icon={Phone}>
                <input className={inp} value={form.phone} onChange={set("phone")} placeholder="+91 80 4xxx xxxx" />
              </Field>
            </div>
            <div className="mt-4 flex items-start gap-4 rounded-xl border border-white/10 bg-white/[.02] p-3" data-testid="tenant-logo-uploader">
              <ImageUploader value={form.logo_url || ""} onChange={(url) => setForm({ ...form, logo_url: url })} kind="logo" circular />
              <div className="text-[11.5px] text-slate-400 leading-relaxed pt-1">
                <div className={`${lbl} mb-1`}>{noun} logo <span className="normal-case tracking-normal text-slate-500">(optional)</span></div>
                Shown on the ₹0 trial invoice and the Congratulations email. Leave empty and Mira designs a logo for them automatically.
              </div>
            </div>
          </Section>

          <Section n="2" title="Owner" hint="Login goes to the owner's personal inbox; WhatsApp reminders to their personal phone.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Owner name *" icon={User}>
                <input data-testid="tenant-owner-name-input" required className={inp} value={form.owner_name} onChange={set("owner_name")} placeholder="Priya Sharma" />
              </Field>
              <Field label="Owner personal phone" icon={Phone} hint="WhatsApp renewal & settlement reminders go here.">
                <input data-testid="tenant-owner-phone-input" className={inp} value={form.owner_phone} onChange={set("owner_phone")} placeholder="+91 98xxx xxxxx" />
              </Field>
              <Field label="Owner email (personal) *" icon={Mail} hint="Used for login. Login details are sent here AND to the business email.">
                <input data-testid="tenant-owner-email-input" type="email" required className={inp} value={form.owner_email} onChange={set("owner_email")} placeholder="owner@gmail.com" />
              </Field>
              <Field label={`${noun} email`} icon={Mail}>
                <input data-testid="tenant-salon-email-input" type="email" className={inp} value={form.salon_email} onChange={set("salon_email")} placeholder={resto ? "hello@restaurant.com" : "hello@salon.com"} />
              </Field>
            </div>
          </Section>

          <Section n="3" title="Plan & access" hint="Pick the subscription tier — you can change it anytime from Billing.">
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map(([v, l]) => (
                <button key={v} type="button" onClick={() => setForm({ ...form, plan: v })} data-testid={`tenant-plan-${v}`}
                  className={`h-11 rounded-xl border text-sm font-semibold transition-all ${form.plan === v ? "border-[#d4af37] bg-[#d4af37]/15 text-[#F0D9A5]" : "border-white/10 text-slate-400 hover:border-white/25"}`}>{l}</button>
              ))}
            </div>
            <TrialPicker value={form.trial_months ?? null} onChange={(m) => setForm({ ...form, trial_months: m })} />
            <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5 text-[11.5px] text-emerald-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>A secure one-time password is generated and shown to you after creation. The owner must change it on first login; the welcome email with setup steps goes out automatically.</span>
            </div>
          </Section>
        </div>

        <div className="px-6 sm:px-8 py-4 border-t border-white/10 bg-black/20 flex items-center gap-3">
          <span className="text-[11px] text-slate-500 hidden sm:block">* required</span>
          <button type="button" onClick={onClose} className="ml-auto h-11 px-5 rounded-full border border-white/15 text-sm text-slate-300 hover:bg-white/5" data-testid="onboard-cancel">Cancel</button>
          <button data-testid="tenant-save-btn" type="submit" disabled={busy}
            className="h-11 px-6 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-sm font-extrabold hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-2 shadow-[0_10px_30px_-10px_rgba(212,175,55,.8)]">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy ? "Creating…" : `Onboard ${noun}`}
          </button>
        </div>
      </form>
    </div>
  );
}

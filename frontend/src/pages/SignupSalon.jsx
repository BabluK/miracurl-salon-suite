import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import log from "@/lib/log";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Scissors, Sparkles, User, Mail, Lock, MapPin, Phone, Check, ArrowRight, ArrowLeft, Building2, Gift, AlertCircle, Eye, EyeOff, PartyPopper, X } from "lucide-react";
import { toast, Toaster } from "sonner";
import { SuiteLogo } from "@/components/SiteHeader";
import { BookingPreviewCard } from "@/components/signup/BookingPreviewCard";
import ChatButton from "@/components/ChatButton";
import { useAuth } from "@/context/AuthContext";
import { setTenantSlug } from "@/lib/api";
import { detectRegion } from "@/lib/region";
import { trackSignup } from "@/lib/analytics";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const TOASTER_OPTIONS = { style: { background: "#fff", color: "#0f172a", border: "1px solid rgba(14,165,233,0.2)" } };
const STEP_LABELS = ["Salon", "Owner", "Location", "Confirm"];
const fmtUSD = (n) => (n == null ? "…" : "$" + Number(n).toLocaleString("en-US"));

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// /signup-salon · /signup-restaurant (generic) · /signup-{salon|restaurant}-{india|us} (dedicated, region locked)
function parseSignupPath(pathname) {
  const m = pathname.match(/signup-(salon|restaurant)(?:-(india|us))?/);
  return { business_type: m?.[1] || "salon", pathRegion: m?.[2] === "india" ? "in" : m?.[2] === "us" ? "intl" : null };
}
const signupPath = (type, region, locked) => locked ? `/signup-${type}-${region === "intl" ? "us" : "india"}` : `/signup-${type}`;
const SIGNUP_LINKS = [["salon", "in", "Salon · India"], ["salon", "intl", "Salon · US"], ["restaurant", "in", "Restaurant · India"], ["restaurant", "intl", "Restaurant · US"]];

export default function SignupSalon() {
  const nav = useNavigate();
  const auth = useAuth();
  const [{ business_type: pathType, pathRegion }] = useState(() => parseSignupPath(window.location.pathname));
  const locked = !!pathRegion;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const trialDays = Number(catalog?.trial_days) || 30;
  const [region, setRegion] = useState(() => {
    try {
      if (pathRegion) { localStorage.setItem("miracurl_region", pathRegion); return pathRegion; }
      const p = new URLSearchParams(window.location.search).get("region");
      if (p === "in" || p === "intl") { localStorage.setItem("miracurl_region", p); return p; }
      return localStorage.getItem("miracurl_region") || detectRegion();
    } catch { return "in"; }
  });
  const isIntl = region === "intl";
  const pickRegion = (k) => { setRegion(k); try { localStorage.setItem("miracurl_region", k); } catch { /* private mode */ } };
  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/public/plans`).then(r => setCatalog(r.data)).catch(() => {});
  }, []);
  const [form, setForm] = useState({
    salon_name: "",
    business_type: pathType,
    slug: "",
    slug_touched: false,
    owner_name: "",
    owner_email: "",
    password: "",
    location: "",
    phone: "",
    newly_opened: false,
    opening_date: "",
    logo_url: "",
  });
  const [newbiz, setNewbiz] = useState(false);

  // Keep the URL in sync with the picked business type / region (dedicated pages keep their -india/-us suffix)
  useEffect(() => {
    const want = signupPath(form.business_type, region, locked);
    if (window.location.pathname !== want) window.history.replaceState(null, "", want + window.location.search);
  }, [form.business_type, region, locked]);

  // Already logged-in users skip the wizard
  useEffect(() => {
    if (auth?.user && auth.user !== false) nav("/dashboard", { replace: true });
  }, [auth?.user, nav]);

  // Capture referral code from URL (?ref=slug) — also handled by Landing,
  // but supports direct /signup-salon?ref=… links.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = (params.get("ref") || "").trim().toLowerCase();
      if (ref && /^[a-z0-9-]{2,40}$/.test(ref)) {
        localStorage.setItem("miracurl_ref", ref);
      }
      const offer = (params.get("offer") || "").trim().toLowerCase();
      if (/^[a-z0-9]{2,20}$/.test(offer)) {
        localStorage.setItem("miracurl_offer", offer);
        if (offer === "newbiz" && !sessionStorage.getItem("miracurl_offer_visit")) {
          sessionStorage.setItem("miracurl_offer_visit", "1");
          axios.post(`${BACKEND_URL}/api/public/newbiz-offer-visit`).catch(() => {});
        }
      }
      if (offer === "newbiz" || localStorage.getItem("miracurl_offer") === "newbiz") setNewbiz(true);
    } catch (err) {
      log.warn("Referral param parse failed:", err);
    }
  }, []);

  // Auto-suggest slug from salon name (until user manually edits it)
  useEffect(() => {
    if (!form.slug_touched) {
      setForm(f => ({ ...f, slug: slugify(f.salon_name) }));
    }
  }, [form.salon_name, form.slug_touched]);

  const update = (patch) => setForm(f => ({ ...f, ...patch }));

  function next() {
    setErr("");
    if (step === 0) {
      if (form.salon_name.trim().length < 3) { setErr("Salon name must be at least 3 characters"); return; }
      if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(form.slug)) {
        setErr("Slug: lowercase letters, digits, hyphens (3–40 chars, no leading/trailing hyphen)"); return;
      }
    }
    if (step === 1) {
      if (form.owner_name.trim().length < 2) { setErr("Owner name is required"); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner_email)) { setErr("Enter a valid email"); return; }
      if (form.password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    }
    setStep(step + 1);
  }
  const back = () => { setErr(""); setStep(Math.max(0, step - 1)); };

  async function submit() {
    setErr(""); setBusy(true);
    try {
      const ref = (localStorage.getItem("miracurl_ref") || "").trim().toLowerCase() || undefined;
      const offer = (localStorage.getItem("miracurl_offer") || "").trim().toLowerCase() || undefined;
      const { data } = await axios.post(`${BACKEND_URL}/api/public/signup-salon`, {
        salon_name: form.salon_name.trim(),
        business_type: form.business_type,
        slug: form.slug.trim() || undefined,
        owner_name: form.owner_name.trim(),
        owner_email: form.owner_email.trim().toLowerCase(),
        password: form.password,
        location: form.location.trim() || undefined,
        phone: form.phone.trim() || undefined,
        ref,
        offer,
        newly_opened: form.newly_opened || undefined,
        opening_date: form.newly_opened ? (form.opening_date || undefined) : undefined,
        region,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
        logo_url: form.logo_url || undefined,
      });
      setTenantSlug(data.tenant.slug);
      trackSignup({ slug: data.tenant.slug, business_type: form.business_type, trial_days: data.trial_days, region, referred: ref });
      localStorage.setItem("miracurl_tenant", data.tenant.slug);
      localStorage.removeItem("miracurl_ref");  // consumed
      localStorage.removeItem("miracurl_offer");
      toast.success(`Welcome ✦ Your ${data.trial_days}-day trial starts now`);
      // Hard reload to /dashboard so AuthContext re-bootstraps cleanly
      window.location.assign("/dashboard");
    } catch (e) {
      const d = e.response?.data?.detail;
      const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map(x => x.msg).join(" · ") : "Signup failed";
      setErr(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  }

  const previewUrl = useMemo(
    () => `${window.location.origin}/book/${form.slug || "your-slug"}`,
    [form.slug],
  );

  const isRestoTheme = form.business_type === "restaurant";
  const accent = isRestoTheme ? "#d97706" : "#c99a2e";
  const soft = isRestoTheme ? "rgba(217,119,6,.12)" : "rgba(212,175,55,.14)";
  const grad = isRestoTheme ? "linear-gradient(135deg,#d97706 0%,#f59e0b 50%,#b45309 100%)" : "linear-gradient(135deg,#d4af37 0%,#f6e27a 50%,#c99a2e 100%)";
  const glow = isRestoTheme ? "0 12px 30px -10px rgba(217,119,6,.5)" : "0 12px 30px -10px rgba(212,175,55,.5)";
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#faf8f5] su-cream" data-testid="signup-salon-page" data-vertical={isRestoTheme ? "restaurant" : "salon"} data-region={region} data-locked={locked ? "1" : "0"}>
      <div id="signup-page-container" data-testid="signup-page-container" className="contents" />
      <Toaster theme="light" position="top-center" toastOptions={TOASTER_OPTIONS} />
      <ChatButton message={`Hi Miracurl ✦ I'm signing up my ${isRestoTheme ? "restaurant" : "salon"} and need a little help.`} label="Need help?" />

      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-[#FBF6EC]/92 border-b border-[#D9B878]/30 shadow-[0_4px_24px_-12px_rgba(184,134,59,0.25)]" data-testid="signup-header">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-2 flex items-center justify-between gap-3">
          <SuiteLogo variant="light" subtitle="AI-powered business management platform" />
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-sm text-[#8a7048]">Already have an account?</span>
            <Link to="/login" data-testid="signup-have-account"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-[#1a1408] whitespace-nowrap transition-[filter,transform] hover:brightness-110 active:scale-95"
              style={{ background: grad, boxShadow: glow }}>Sign in →</Link>
          </div>
        </div>
      </header>
      <div className="h-[72px] sm:h-20" aria-hidden="true" />

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-20">
        <div className="mb-4 flex items-center justify-center gap-2 text-xs text-[#8a7048]" data-testid="signup-page-label">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#D9B878]/40 font-semibold">
            {isRestoTheme ? "🍴 Restaurant" : "💇 Salon / Spa"} · {isIntl ? "🇺🇸 US / International" : "🇮🇳 India"}
          </span>
        </div>
        <div className="bg-white rounded-[28px] shadow-[0_20px_40px_-15px_rgba(10,9,7,.08),0_0_20px_rgba(212,175,55,.06)] border border-[#d4af37]/25 p-6 sm:p-9" data-testid="signup-form-card" style={{ "--su-accent": accent, "--su-soft": soft, "--su-grad": grad }}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
            <span data-testid="signup-trial-badge" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.16em] font-bold border"
              style={{ color: accent, borderColor: accent + "55", background: soft }}>
              <Sparkles className="w-3 h-3" /> {(newbiz || form.newly_opened) ? "90-Day Free Setup · New Business Offer" : form.business_type === "restaurant" ? "First Month Free · No credit card · Cancel anytime" : `${trialDays}-Day Free Trial · No credit card · Cancel anytime`}
            </span>
            {!locked && (
              <div className="inline-flex items-center gap-1 p-1 rounded-full bg-slate-100 border border-slate-200" data-testid="signup-region-toggle" id="currency-region-toggle">
                {[["in", "🇮🇳 ₹"], ["intl", "🌍 $"]].map(([k, l]) => (
                  <button key={k} type="button" data-testid={`signup-region-${k}`} onClick={() => pickRegion(k)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${region === k ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Stepper step={step} resto={form.business_type === "restaurant"} />

          {step === 0 && (
            <SalonStep form={form} update={update} locked={locked} isIntl={isIntl} />
          )}
          {step === 1 && (
            <OwnerStep form={form} update={update} showPw={showPw} setShowPw={setShowPw} />
          )}
          {step === 2 && (
            <LocationStep form={form} update={update} isIntl={isIntl} />
          )}
          {step === 3 && (
            <ReviewStep form={form} previewUrl={previewUrl} catalog={catalog} isIntl={isIntl} />
          )}

          {err && (
            <div className="mt-6 flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-sm" data-testid="signup-error">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {err}
            </div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
            <button
              data-testid="signup-back-btn"
              type="button"
              onClick={back}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {step < 3 ? (
              <button
                data-testid="signup-next-btn"
                type="button"
                onClick={next}
                className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-[#1a1408] text-sm font-semibold hover:brightness-110 active:scale-95 transition-[filter,transform] shadow-[0_8px_20px_-6px_rgba(59,130,246,0.6)] transition" style={{ background: grad, boxShadow: glow }}
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                data-testid="signup-submit-btn"
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-[#1a1408] text-sm font-semibold hover:brightness-110 active:scale-95 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60" style={{ background: grad, boxShadow: glow }}
              >
                {busy ? (form.business_type === "restaurant" ? "Creating your restaurant…" : "Creating your salon…") : <>{form.business_type === "restaurant" ? "Start free month" : "Start free trial"} <Gift className="w-4 h-4" /></>}
              </button>
            )}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">By signing up you agree to our <a href="/terms-of-service" className="underline hover:text-slate-600">Terms of Service</a> and <a href="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</a>.</p>
        </div>

        {locked && (
          <p className="mt-5 text-center text-[11px] text-slate-400" data-testid="signup-switch-links">
            Wrong page?{" "}
            {SIGNUP_LINKS.filter(([t, r]) => !(t === form.business_type && r === region)).map(([t, r, l], i) => (
              <span key={t + r}>{i > 0 && <span className="mx-1.5 text-slate-300">|</span>}<a href={signupPath(t, r, true)} data-testid={`signup-switch-${t}-${r}`} className="underline hover:text-[var(--su-accent)]">{l}</a></span>
            ))}
          </p>
        )}
      </main>
    </div>
  );
}

function Stepper({ step, resto = false }) {
  const labels = resto ? ["Restaurant", ...STEP_LABELS.slice(1)] : STEP_LABELS;
  return (
    <div className="flex items-center gap-2 sm:gap-3 mb-8 overflow-x-auto pb-1">
      {labels.map((l, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={l} data-testid={`stepper-step-${i + 1}`} className="flex items-center gap-2 flex-shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition ${
              done ? "text-[#1a1408] bg-[image:var(--su-grad)] shadow-md" :
              active ? "bg-[var(--su-soft)] border-2 border-[var(--su-accent)] text-[var(--su-accent)]" :
              "bg-slate-100 text-slate-400"
            }`}>
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs uppercase tracking-[0.2em] hidden sm:inline ${active ? "text-[var(--su-accent)]" : done ? "text-slate-600" : "text-slate-300"}`}>{l}</span>
            {i < labels.length - 1 && <div className={`w-6 sm:w-10 h-px ${done ? "bg-[var(--su-accent)]" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, icon: Icon, testid, type = "text", value, onChange, placeholder, prefix, trailing }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-2 font-medium">{label}</label>
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[var(--su-soft)] flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-[var(--su-accent)]" />
        </div>
        {prefix && <span className="absolute left-14 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">{prefix}</span>}
        <input
          data-testid={testid}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${prefix ? "pl-[7rem]" : "pl-14"} pr-12 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:bg-white focus:border-sky-300 transition-all`}
        />
        {trailing && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </div>
  );
}

function SalonStep({ form, update, locked = false, isIntl = false }) {
  const [showNewbizModal, setShowNewbizModal] = useState(false);
  const [assistEmail, setAssistEmail] = useState("");
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistSent, setAssistSent] = useState(false);
  const isResto = form.business_type === "restaurant";
  useEffect(() => {
    if (!showNewbizModal) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [showNewbizModal]);
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Tell us about your {isResto ? "restaurant" : "salon"}</h2>
        <p className="text-sm text-slate-500 mt-1">This is how customers will see you on the booking page.</p>
      </div>
      {!locked && (
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">What's your business?</p>
        <div className="grid grid-cols-2 gap-3">
          {[["salon", "💇 Salon / Spa", "Bookings, stylists & billing"], ["restaurant", "🍴 Restaurant", "Menu, table reservations & orders"]].map(([v, title, sub]) => (
            <button key={v} type="button"
              onClick={() => update({ business_type: v })}
              data-testid={`business-type-${v}-button`}
              className={`text-left rounded-xl border-2 px-4 py-3 transition-[transform,border-color,background-color] duration-200 hover:scale-[1.02] active:scale-[0.98] ${form.business_type === v ? "border-[var(--su-accent)] bg-[var(--su-soft)] shadow-sm" : "border-slate-200 bg-white hover:border-[#d4af37]/50"}`}>
              <span className="block text-sm font-bold text-slate-800">{title}</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">{sub}</span>
            </button>
          ))}
        </div>
      </div>
      )}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Is your {isResto ? "restaurant" : "salon"} newly opened (or opening soon)? 🎊</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" data-testid="newly-opened-yes-btn"
            onClick={() => setShowNewbizModal(true)}
            className={`text-left rounded-xl border-2 px-4 py-3 transition-all ${form.newly_opened ? "border-amber-400 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-amber-300"}`}>
            <span className="block text-sm font-bold text-slate-800">🎉 Yes, we're new!</span>
            <span className="block text-[11px] text-amber-600 mt-0.5 font-semibold">Special offer — FREE 90-day setup</span>
          </button>
          <button type="button" data-testid="newly-opened-no-btn"
            onClick={() => update({ newly_opened: false, opening_date: "" })}
            className={`text-left rounded-xl border-2 px-4 py-3 transition-all ${!form.newly_opened ? "border-[var(--su-accent)] bg-[var(--su-soft)] shadow-sm" : "border-slate-200 bg-white hover:border-[#d4af37]/50"}`}>
            <span className="block text-sm font-bold text-slate-800">We're established</span>
            <span className="block text-[11px] text-slate-400 mt-0.5">Standard free trial</span>
          </button>
        </div>
      </div>
      {showNewbizModal && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" data-testid="newbiz-offer-modal"
          onClick={() => setShowNewbizModal(false)}>
          <div className="relative w-full max-w-sm max-h-[90vh] flex flex-col rounded-3xl overflow-hidden bg-white shadow-2xl animate-fade-up"
            onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setShowNewbizModal(false)} data-testid="newbiz-modal-close"
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 text-white hover:bg-black/40 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-500 px-6 pt-7 pb-5 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg">
                <PartyPopper className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="font-playfair text-xl text-slate-900 mt-3">Congratulations on your new {isResto ? "restaurant" : "salon"}! 🎊</h3>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <p className="text-sm text-slate-600 leading-relaxed">
                Starting fresh is the perfect time to get your systems right. As a welcome gift, you get a
                <b className="text-amber-600"> FREE 90-day setup</b> — bookings, billing, staff, WhatsApp marketing
                and Mira AI. We&apos;ll also email your special subscription plan.
              </p>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">When did / will you open? *</label>
                <input type="date" data-testid="opening-date-input" value={form.opening_date}
                  onChange={e => update({ opening_date: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white" />
                <p className="text-[10px] text-slate-400 mt-1">Past or upcoming date — both qualify.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">{isResto ? "Restaurant" : "Salon"} name *</label>
                <input data-testid="newbiz-salon-name-input" value={form.salon_name}
                  onChange={e => update({ salon_name: e.target.value })}
                  placeholder={isResto ? "e.g. Spice Villa, Koramangala" : "e.g. Glow Salon, Indiranagar"}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Your booking URL *</label>
                <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden" style={{ background: "#ffffff" }}>
                  <span className="pl-3 pr-1 text-xs text-slate-400 font-mono shrink-0">/book/</span>
                  <input data-testid="newbiz-slug-input" value={form.slug}
                    onChange={e => update({ slug: slugify(e.target.value), slug_touched: true })}
                    placeholder="your-business-name"
                    style={{ background: "#ffffff", color: "#1e293b", WebkitTextFillColor: "#1e293b", boxShadow: "0 0 0 30px #ffffff inset" }}
                    className="flex-1 min-w-0 px-1 py-2.5 text-sm placeholder:text-slate-300 outline-none border-0" />
                </div>
                {form.slug && (
                  <p className="text-[10px] text-slate-400 mt-1 truncate">
                    Customers will visit <span className="text-[var(--su-accent)] font-mono">{window.location.origin}/book/{form.slug}</span>
                  </p>
                )}
              </div>
              <button type="button" data-testid="claim-newbiz-btn"
                disabled={!form.opening_date || form.salon_name.trim().length < 2 || !form.slug}
                onClick={() => { update({ newly_opened: true }); setShowNewbizModal(false); }}
                className="w-full py-3 rounded-full text-sm font-bold text-slate-900 bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                <Gift className="w-4 h-4" /> Claim my FREE 90-day setup
              </button>
              <div className="flex items-center gap-3">
                <span className="flex-1 h-px bg-slate-200" /><span className="text-[10px] uppercase tracking-widest text-slate-400">or</span><span className="flex-1 h-px bg-slate-200" />
              </div>
              {assistSent ? (
                <p className="text-xs text-emerald-600 text-center font-semibold" data-testid="assist-thanks">
                  ✅ Got it! The Miracurl team will reach out shortly to set everything up for you.
                </p>
              ) : (
                <div>
                  <p className="text-xs text-slate-500 mb-2">
                    Prefer we do it for you? Share your email and the <b>Miracurl team will onboard your {isResto ? "restaurant" : "salon"}</b> — free of charge.
                  </p>
                  <div className="flex gap-2">
                    <input type="email" data-testid="assist-email-input" value={assistEmail}
                      onChange={e => setAssistEmail(e.target.value)} placeholder="your@email.com"
                      style={{ background: "#ffffff", color: "#1e293b" }}
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-300" />
                    <button type="button" data-testid="assist-submit-btn"
                      disabled={assistBusy || !/^\S+@\S+\.\S+$/.test(assistEmail)}
                      onClick={async () => {
                        setAssistBusy(true);
                        try {
                          await axios.post(`${BACKEND_URL}/api/public/newbiz-assist`, {
                            email: assistEmail.trim(), business_name: form.salon_name.trim(),
                            business_type: form.business_type, opening_date: form.opening_date, phone: form.phone || "",
                          });
                          setAssistSent(true);
                        } catch { toast.error("Couldn't send — please try again"); }
                        finally { setAssistBusy(false); }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-40 shrink-0">
                      {assistBusy ? "Sending…" : "Onboard me"}
                    </button>
                  </div>
                </div>
              )}
              <button type="button" data-testid="newbiz-maybe-later-btn"
                onClick={() => { update({ newly_opened: false }); setShowNewbizModal(false); }}
                className="w-full text-center text-[11px] text-slate-400 hover:text-slate-600 underline pt-1">
                Maybe later — continue with the standard signup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <Field
        label={`${isResto ? "Restaurant" : "Salon"} name *`}
        icon={Building2}
        testid="signup-salon-name"
        value={form.salon_name}
        onChange={v => update({ salon_name: v })}
        placeholder={isResto ? (isIntl ? "e.g. Spice Garden, Austin" : "e.g. Spice Garden, Indiranagar") : (isIntl ? "e.g. Glow Salon, Austin" : "e.g. Glow Salon, Indiranagar")}
      />
      <Field
        label="Your booking URL *"
        icon={Scissors}
        testid="signup-slug"
        value={form.slug}
        onChange={v => update({ slug: slugify(v), slug_touched: true })}
        placeholder="your-business-name"
        prefix="/book/"
      />
      <p className="text-xs text-slate-500 -mt-2">
        Customers will visit <span className="font-mono text-[var(--su-accent)]">{`${window.location.origin}/book/${form.slug || "your-slug"}`}</span>
      </p>
      <BookingPreviewCard name={form.salon_name} slug={form.slug} resto={isResto} location={form.location}
        logoUrl={form.logo_url} onLogo={(u) => update({ logo_url: u })} />
    </div>
  );
}

function OwnerStep({ form, update, showPw, setShowPw }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Create your owner account</h2>
        <p className="text-sm text-slate-500 mt-1">You&apos;ll use this to sign in to your salon admin.</p>
      </div>
      <Field label="Your name *" icon={User} testid="signup-owner-name" value={form.owner_name} onChange={v => update({ owner_name: v })} placeholder="Full name" />
      <Field label="Email *" icon={Mail} testid="signup-owner-email" type="email" value={form.owner_email} onChange={v => update({ owner_email: v })} placeholder="you@salon.com" />
      <Field
        label="Password *"
        icon={Lock}
        testid="signup-password"
        type={showPw ? "text" : "password"}
        value={form.password}
        onChange={v => update({ password: v })}
        placeholder="At least 8 characters"
        trailing={
          <button type="button" onClick={() => setShowPw(!showPw)} className="text-slate-400 hover:text-slate-600" data-testid="signup-toggle-password" aria-label={showPw ? "Hide password" : "Show password"}>
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />
    </div>
  );
}

function LocationStep({ form, update, isIntl = false }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Where are you located? <span className="text-sm font-normal text-slate-400">(optional)</span></h2>
        <p className="text-sm text-slate-500 mt-1">Helps customers find you on the booking page. You can edit these later.</p>
      </div>
      <Field label="Location" icon={MapPin} testid="signup-location" value={form.location} onChange={v => update({ location: v })} placeholder={isIntl ? "Austin, TX" : "Indiranagar, Bangalore"} />
      <Field label="Phone" icon={Phone} testid="signup-phone" type="tel" value={form.phone} onChange={v => update({ phone: v })} placeholder={isIntl ? "+1 (512) 555-0147" : "+91 98765 43210"} />
    </div>
  );
}

function ReviewStep({ form, previewUrl, catalog, isIntl }) {
  const isResto = form.business_type === "restaurant";
  const rows = [
    { label: form.business_type === "restaurant" ? "Restaurant" : "Salon", value: form.salon_name },
    { label: "Booking URL", value: previewUrl, mono: true },
    { label: "Owner", value: `${form.owner_name} · ${form.owner_email}` },
    { label: "Location", value: form.location || "—" },
    { label: "Phone", value: form.phone || "—" },
  ];
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Review &amp; confirm</h2>
        <p className="text-sm text-slate-500 mt-1">We&apos;ll start your {isResto ? "FREE first month" : `${Number(catalog?.trial_days) || 30}-day free trial`} the moment you click below.</p>
      </div>
      <div className="bg-[var(--su-soft)] border border-slate-200 rounded-xl divide-y divide-slate-200" data-testid="signup-review">
        {rows.map(r => (
          <div key={r.label} className="flex items-start justify-between p-4 text-sm gap-4">
            <span className="text-slate-500 font-medium uppercase tracking-wider text-[10px] mt-1">{r.label}</span>
            <span className={`text-slate-800 text-right ${r.mono ? "font-mono text-xs" : ""} break-all`}>{r.value || "—"}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-500 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-[var(--su-accent)] mt-0.5 flex-shrink-0" />
        {isIntl && isResto ? (
          <span data-testid="signup-review-pricing-resto-intl">After your free month, choose {fmtUSD(catalog?.resto_intl_monthly?.price)} / month, {fmtUSD(catalog?.resto_intl_quarter?.price)} / 3 months or {fmtUSD(catalog?.resto_intl_annual?.price)} / year — billed in USD via secure international payment link.</span>
        ) : isIntl ? (
          <span data-testid="signup-review-pricing-intl">After your trial, plans start at {fmtUSD(catalog?.intl_starter_monthly?.price)}/month (Starter) — Professional from {fmtUSD(catalog?.intl_pro_monthly?.price)}/month, annual plans get 2 months free. Billed in USD via secure international payment link.</span>
        ) : isResto ? (
          <span data-testid="signup-review-pricing-resto">After your free month, choose ₹{Number(catalog?.resto_monthly?.price).toLocaleString("en-IN")} / month, ₹{Number(catalog?.resto_quarter?.price).toLocaleString("en-IN")} / 3 months or ₹{Number(catalog?.resto_annual?.price).toLocaleString("en-IN")} / 1 year. We&apos;ll send payment instructions via WhatsApp before the trial expires.</span>
        ) : (
          <span data-testid="signup-review-pricing-in">After your trial, pay flexibly — ₹{Number(catalog?.monthly?.price).toLocaleString("en-IN")} / month, ₹{Number(catalog?.quarter?.price).toLocaleString("en-IN")} / 3 months or ₹{Number(catalog?.annual?.price).toLocaleString("en-IN")} / year (1 month free). We&apos;ll send payment instructions via WhatsApp before the trial expires.</span>
        )}
      </div>
    </div>
  );
}

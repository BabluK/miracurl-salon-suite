import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import log from "@/lib/log";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Scissors, Sparkles, User, Mail, Lock, MapPin, Phone, Check, ArrowRight, ArrowLeft, Building2, Gift, AlertCircle, Eye, EyeOff, PartyPopper, X } from "lucide-react";
import { toast, Toaster } from "sonner";
import BrandMark from "@/components/BrandMark";
import ChatButton from "@/components/ChatButton";
import { useAuth } from "@/context/AuthContext";
import { setTenantSlug, formatApiError } from "@/lib/api";
import { detectRegion } from "@/lib/region";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const TOASTER_OPTIONS = { style: { background: "#fff", color: "#0f172a", border: "1px solid rgba(14,165,233,0.2)" } };
const STEP_LABELS = ["Salon", "Owner", "Location", "Confirm"];
const kFmt = (n) => (n >= 1000 && n % 1000 === 0 ? `₹${n / 1000}K` : `₹${Number(n).toLocaleString("en-IN")}`);
const fmtUSD = (n) => "$" + Number(n).toLocaleString("en-US");

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export default function SignupSalon() {
  const nav = useNavigate();
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const trialDays = Number(catalog?.trial_days) || 30;
  const effNewbiz = () => newbiz || form.newly_opened;
  const [region, setRegion] = useState(() => {
    try {
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
    business_type: window.location.pathname.includes("restaurant") ? "restaurant" : "salon",
    slug: "",
    slug_touched: false,
    owner_name: "",
    owner_email: "",
    password: "",
    location: "",
    phone: "",
    newly_opened: false,
    opening_date: "",
  });
  const [newbiz, setNewbiz] = useState(false);

  // Keep the URL in sync with the picked business type (/signup-salon ↔ /signup-restaurant)
  useEffect(() => {
    const want = form.business_type === "restaurant" ? "/signup-restaurant" : "/signup-salon";
    if (window.location.pathname !== want) window.history.replaceState(null, "", want + window.location.search);
  }, [form.business_type]);

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
      });
      setTenantSlug(data.tenant.slug);
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

  return (
    <div className="min-h-screen relative overflow-hidden bg-white" data-testid="signup-salon-page">
      <Toaster theme="light" position="top-center" toastOptions={TOASTER_OPTIONS} />
      <ChatButton message="Hi Miracurl ✦ I'm signing up my salon and need a little help." label="Need help?" />

      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -right-32 -top-32 w-[520px] h-[520px] rounded-full opacity-80"
           style={{ background: "radial-gradient(circle at 30% 30%, #ec4899, #d946ef 40%, #6366f1 80%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -left-40 -bottom-44 w-[520px] h-[520px] rounded-full opacity-70"
           style={{ background: "radial-gradient(circle at 60% 40%, #818cf8, #a78bfa 40%, #ec4899 80%, transparent 100%)" }} />

      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-white/85 border-b border-[#e9d9ae]/50 px-8 py-3 sm:px-14 flex items-center justify-between">
        <BrandMark variant="light" size="lg" />
        <Link to="/login" className="text-sm text-sky-600 hover:text-sky-700 font-medium" data-testid="signup-have-account">
          Already have an account? Sign in →
        </Link>
      </header>
      <div className="h-24" aria-hidden="true" />


      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-8 py-10 pb-24">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span data-testid="signup-trial-badge" className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.18em] font-semibold ${(newbiz || form.newly_opened) ? "bg-amber-50 border border-amber-200 text-amber-700" : "bg-sky-50 border border-sky-100 text-sky-600"}`}>
            <Sparkles className="w-3 h-3" /> {(newbiz || form.newly_opened) ? "90-Day Free Setup · New Business Offer" : form.business_type === "restaurant" ? "First Month Free · No credit card" : `${trialDays}-Day Free Trial · No credit card`}
          </span>
          <h1 className="font-playfair text-4xl sm:text-5xl tracking-tight text-slate-900 mt-4">Bring your {form.business_type === "restaurant" ? "restaurant" : "salon"} online ✦</h1>
          <p className="text-slate-600 mt-3 text-sm sm:text-base">
            {form.business_type === "restaurant"
              ? "Set up your menu, QR table ordering, reservations and billing in under 90 seconds. Cancel anytime — no questions asked."
              : "Set up bookings, billing, staff, and customer reviews in under 90 seconds. Cancel anytime during the trial — no questions asked."}
          </p>
          <div className="mt-5 inline-flex items-center gap-1 p-1 rounded-full bg-slate-100 border border-slate-200" data-testid="signup-region-toggle">
            {[["in", "🇮🇳 India · ₹"], ["intl", "🌍 International · $"]].map(([k, l]) => (
              <button key={k} type="button" data-testid={`signup-region-${k}`} onClick={() => pickRegion(k)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${region === k
                  ? "bg-white shadow text-sky-600"
                  : "text-slate-500 hover:text-slate-700"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.15)] ring-1 ring-slate-100 p-6 sm:p-10">
          <Stepper step={step} resto={form.business_type === "restaurant"} />

          {step === 0 && (
            <SalonStep form={form} update={update} />
          )}
          {step === 1 && (
            <OwnerStep form={form} update={update} showPw={showPw} setShowPw={setShowPw} />
          )}
          {step === 2 && (
            <LocationStep form={form} update={update} />
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
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold hover:from-sky-600 hover:to-blue-600 shadow-[0_8px_20px_-6px_rgba(59,130,246,0.6)] transition"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                data-testid="signup-submit-btn"
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white text-sm font-semibold hover:from-rose-600 hover:to-fuchsia-700 shadow-[0_8px_20px_-6px_rgba(244,63,94,0.55)] transition disabled:opacity-60"
              >
                {busy ? (form.business_type === "restaurant" ? "Creating your restaurant…" : "Creating your salon…") : <>{form.business_type === "restaurant" ? "Start free month" : "Start free trial"} <Gift className="w-4 h-4" /></>}
              </button>
            )}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">By signing up you agree to our <a href="/terms-of-service" className="underline hover:text-slate-600">Terms of Service</a> and <a href="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</a>.</p>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {(form.business_type === "restaurant" ? (isIntl ? [
            { v: "$0", l: "First month" },
            { v: effNewbiz() ? "90 days" : `${trialDays} days`, l: "Free trial" },
            { v: catalog?.resto_intl_half?.price ? `${fmtUSD(catalog.resto_intl_half.price)}` : "—", l: "6-month plan" },
            { v: catalog?.resto_intl_annual?.price ? `${fmtUSD(catalog.resto_intl_annual.price)}` : "—", l: "Annual plan" },
          ] : [
            { v: "₹0", l: "First month" },
            { v: catalog?.resto_quarter?.price ? kFmt(catalog.resto_quarter.price) : "—", l: "3-month plan" },
            { v: catalog?.resto_half?.price ? kFmt(catalog.resto_half.price) : "—", l: "6-month plan" },
            { v: catalog?.resto_annual?.price ? kFmt(catalog.resto_annual.price) : "—", l: "Annual plan" },
          ]) : isIntl ? [
            { v: "$0", l: "Trial cost" },
            { v: effNewbiz() ? "90 days" : `${trialDays} days`, l: "Free trial" },
            { v: catalog?.intl_pro_monthly?.price ? `${fmtUSD(catalog.intl_pro_monthly.price)}/mo` : "—", l: "Professional plan" },
            { v: catalog?.intl_pro_annual?.price ? `${fmtUSD(catalog.intl_pro_annual.price)}/yr` : "—", l: "Pro annual" },
          ] : [
            { v: "₹0", l: "Trial cost" },
            { v: effNewbiz() ? "90 days" : `${trialDays} days`, l: "Free trial" },
            { v: catalog?.half_year?.price ? kFmt(catalog.half_year.price) : "—", l: "6-month plan" },
            { v: catalog?.annual?.price ? kFmt(catalog.annual.price) : "—", l: "Annual plan" },
          ]).map(c => (
            <div key={c.l} className="bg-white/70 backdrop-blur-sm rounded-lg border border-slate-200 px-3 py-3">
              <div className="text-lg font-bold text-slate-800">{c.v}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">{c.l}</div>
            </div>
          ))}
        </div>
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
          <div key={l} className="flex items-center gap-2 flex-shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition ${
              done ? "bg-sky-500 text-white" :
              active ? "bg-sky-50 border-2 border-sky-500 text-sky-600" :
              "bg-slate-100 text-slate-400"
            }`}>
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs uppercase tracking-[0.2em] hidden sm:inline ${active ? "text-sky-600" : done ? "text-slate-600" : "text-slate-300"}`}>{l}</span>
            {i < labels.length - 1 && <div className={`w-6 sm:w-10 h-px ${done ? "bg-sky-500" : "bg-slate-200"}`} />}
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
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-sky-500" />
        </div>
        {prefix && <span className="absolute left-14 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">{prefix}</span>}
        <input
          data-testid={testid}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${prefix ? "pl-[7rem]" : "pl-14"} pr-12 py-3.5 rounded-xl bg-sky-50/70 border border-sky-100 text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:bg-white focus:border-sky-300 transition-all`}
        />
        {trailing && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </div>
  );
}

function SalonStep({ form, update }) {
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
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">What's your business?</p>
        <div className="grid grid-cols-2 gap-3">
          {[["salon", "💇 Salon / Spa", "Bookings, stylists & billing"], ["restaurant", "🍽️ Restaurant", "Menu, table reservations & orders"]].map(([v, title, sub]) => (
            <button key={v} type="button" data-testid={`signup-type-${v}`}
              onClick={() => update({ business_type: v })}
              className={`text-left rounded-xl border-2 px-4 py-3 transition-all ${form.business_type === v ? "border-sky-400 bg-sky-50 shadow-sm" : "border-slate-200 bg-white hover:border-sky-200"}`}>
              <span className="block text-sm font-bold text-slate-800">{title}</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">{sub}</span>
            </button>
          ))}
        </div>
      </div>
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
            className={`text-left rounded-xl border-2 px-4 py-3 transition-all ${!form.newly_opened ? "border-sky-400 bg-sky-50 shadow-sm" : "border-slate-200 bg-white hover:border-sky-200"}`}>
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
                    Customers will visit <span className="text-sky-600 font-mono">{window.location.origin}/book/{form.slug}</span>
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
        placeholder={isResto ? "e.g. Spice Garden, Indiranagar" : "e.g. Glow Salon, Indiranagar"}
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
        Customers will visit <span className="font-mono text-sky-600">{`${window.location.origin}/book/${form.slug || "your-slug"}`}</span>
      </p>
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

function LocationStep({ form, update }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Where are you located? <span className="text-sm font-normal text-slate-400">(optional)</span></h2>
        <p className="text-sm text-slate-500 mt-1">Helps customers find you on the booking page. You can edit these later.</p>
      </div>
      <Field label="Location" icon={MapPin} testid="signup-location" value={form.location} onChange={v => update({ location: v })} placeholder="Indiranagar, Bangalore" />
      <Field label="Phone" icon={Phone} testid="signup-phone" type="tel" value={form.phone} onChange={v => update({ phone: v })} placeholder="+91 98765 43210" />
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
      <div className="bg-sky-50/50 border border-sky-100 rounded-xl divide-y divide-sky-100" data-testid="signup-review">
        {rows.map(r => (
          <div key={r.label} className="flex items-start justify-between p-4 text-sm gap-4">
            <span className="text-slate-500 font-medium uppercase tracking-wider text-[10px] mt-1">{r.label}</span>
            <span className={`text-slate-800 text-right ${r.mono ? "font-mono text-xs" : ""} break-all`}>{r.value || "—"}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-500 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-sky-500 mt-0.5 flex-shrink-0" />
        {isIntl && isResto ? (
          <span data-testid="signup-review-pricing-resto-intl">After your free month, choose {fmtUSD(catalog?.resto_intl_quarter?.price ?? 299)} / 3 months, {fmtUSD(catalog?.resto_intl_half?.price ?? 549)} / 6 months or {fmtUSD(catalog?.resto_intl_annual?.price ?? 999)} / year — billed in USD via secure international payment link.</span>
        ) : isIntl ? (
          <span data-testid="signup-review-pricing-intl">After your trial, plans start at {fmtUSD(catalog?.intl_starter_monthly?.price ?? 79)}/month (Starter) — Professional from {fmtUSD(catalog?.intl_pro_monthly?.price ?? 149)}/month. Billed in USD via secure international payment link.</span>
        ) : isResto ? (
          <span data-testid="signup-review-pricing-resto">After your free month, choose ₹{Number(catalog?.resto_quarter?.price ?? 3000).toLocaleString("en-IN")} / 3 months, ₹{Number(catalog?.resto_half?.price ?? 6000).toLocaleString("en-IN")} / 6 months or ₹{Number(catalog?.resto_annual?.price ?? 12000).toLocaleString("en-IN")} / 1 year. We&apos;ll send payment instructions via WhatsApp before it ends.</span>
        ) : (
          <span data-testid="signup-review-pricing-in">After your trial, choose {catalog?.half_year?.price ? `₹${Number(catalog.half_year.price).toLocaleString("en-IN")}` : "a 6-month"} / 6 months or {catalog?.annual?.price ? `₹${Number(catalog.annual.price).toLocaleString("en-IN")}` : "an annual"} / 1 year. We&apos;ll send payment instructions via WhatsApp before the trial expires.</span>
        )}
      </div>
    </div>
  );
}

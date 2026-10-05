import { Link } from "react-router-dom";
import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Star, ArrowRight, Check, Sparkles, Gift, Zap, Play, X, Mail, Instagram, Facebook, Linkedin, Crown, MessageSquare, MapPin } from "lucide-react";
import SalesChatWidget from "@/components/SalesChatWidget";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import api from "@/lib/api";
import { currentRegion, rememberRegion, signupHref } from "@/lib/region";
import { track, trackCta } from "@/lib/analytics";
import { COPY } from "@/components/landing/landingCopy";
import { UsWhySwitch, UsStickyCta } from "@/components/landing/UsLanding";
import { TwoDoorHero } from "@/components/landing/TwoDoorHero";
import { VerticalSection } from "@/components/landing/VerticalSection";
import { SiteHeader } from "@/components/SiteHeader";

// Below-the-fold sections load after first paint — keeps the hero fast on phones.
const DemoCarousel = lazy(() => import("@/components/DemoCarousel").then(m => ({ default: m.DemoCarousel })));
const RestoDemoCarousel = lazy(() => import("@/components/RestoDemoCarousel").then(m => ({ default: m.RestoDemoCarousel })));
const PartnerGrid = lazy(() => import("@/components/PartnerGrid").then(m => ({ default: m.PartnerGrid })));
const MiracurlProductsStrip = lazy(() => import("@/components/MiracurlProductsStrip").then(m => ({ default: m.MiracurlProductsStrip })));

const IMG = {
  hero: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/98878cd0ea553bd4df7cc6ca3c05eaea3bd83533c44c0b7b2785932491d9d440.jpeg",
  videoPoster: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/394d0556e2556ee48e48994393cc5d31c76c9d7a2c7b34c01b50bd6d2995cee9.jpeg",
  mira: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/0edf7cea5fd92564bf4bc69be15455570ba5f75f85561ee7bd0cdca2578254cc.png",
  pos: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/65e892308ec77806aafab7631f043393928bd5918a8b0fc0debb8ee8782bc338.png",
};


const PLANS = [
  { key: "trial", title: "Free Trial", price: "₹0", per: "30 days", cta: "Start trial", primary: false,
    items: ["All features unlocked", "Up to 50 customers", "Email support", "Cancel anytime"] },
  { key: "monthly", title: "Monthly Plan", price: "…", per: "per month · cancel anytime", cta: "Get started", primary: false,
    items: ["Unlimited customers", "Unlimited bookings", "Per-stylist commission", "WhatsApp support", "All features"] },
  { key: "quarter", title: "3-Month Plan", price: "…", per: "for 3 months · flexible", cta: "Pay quarterly", primary: false,
    items: ["Everything in Monthly", "One payment per quarter", "WhatsApp support", "All features"] },
  { key: "annual", title: "Annual Plan", price: "…", per: "for 1 year", cta: "Best value", primary: true,
    items: ["Everything in Monthly", "12 months for the price of 11", "Priority support", "Custom branding next year"] },
  { key: "multi_branch", title: "Multi-Branch", price: "…", per: "annual plans for 2, 3 and 5+ branches", cta: "For salon chains", primary: false,
    items: ["Everything in Annual", "5+ branches, one account", "Branch-wise reports", "Dedicated onboarding"] },
];

const fmtINR = (n) => "₹" + Number(n).toLocaleString("en-IN");
const kINR = (n) => "₹" + Math.round(n / 1000) + "k";
const fmtUSD = (n) => (n == null ? "…" : "$" + Number(n).toLocaleString("en-US"));

// Restaurant plans straight from the HQ catalog (vertical === "restaurant"), filtered by currency.
function restoPlans(catalog, currency) {
  return Object.entries(catalog || {})
    .filter(([, v]) => v && typeof v === "object" && v.vertical === "restaurant" && (v.currency || "INR") === currency)
    .sort((a, b) => (a[1].duration_days || 0) - (b[1].duration_days || 0))
    .map(([k, v]) => ({
      key: k, label: v.custom ? v.label : (v.duration_days <= 31 ? "Monthly" : v.duration_days >= 365 ? "1 Year" : `${Math.round(v.duration_days / 30.4)} Months`),
      price: currency === "USD" ? fmtUSD(v.price) : fmtINR(v.price), popular: !!v.highlight,
      sub: v.duration_days <= 31 ? "Flexible — cancel anytime" : v.duration_days >= 365 ? "Best value — one payment a year" : "Perfect to try everything",
    }));
}

function RestaurantPlans({ catalog, currency, region }) {
  const list = restoPlans(catalog, currency);
  if (!list.length) return null;
  return (
    <div className="mt-14" data-testid="resto-pricing">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div>
          <div className="text-[10px] tracking-[0.35em] uppercase font-bold text-amber-600">🍽️ Restaurant plans</div>
          <h3 className="font-playfair text-2xl sm:text-3xl text-slate-900 mt-2">First month free — then pick what suits you</h3>
        </div>
        <Link to={signupHref("restaurant", region)} onClick={() => trackCta("pricing-resto-cta", { region })} data-testid="resto-pricing-cta"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-bold bg-gradient-to-r from-amber-500 to-rose-500 hover:brightness-110 hover:-translate-y-0.5 transition-transform">
          Start your free month <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {list.map(p => (
          <div key={p.key} data-testid={`resto-plan-${p.key}`}
            className={`rounded-3xl border p-6 bg-white ${p.popular ? "border-amber-400 ring-2 ring-amber-200 shadow-lg" : "border-[#e9d9ae]"}`}>
            {p.popular && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white">MOST POPULAR</span>}
            <p className={`text-sm font-bold text-slate-500 ${p.popular ? "mt-3" : ""}`}>{p.label}</p>
            <p className="font-playfair text-3xl mt-1 text-amber-600">{p.price}</p>
            <p className="text-slate-400 text-xs mt-1">{p.sub}</p>
            <ul className="mt-4 space-y-1.5">
              {["All features included", "Unlimited orders & tables", "Mira AI included"].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-slate-500"><Check className="w-3 h-3 text-emerald-500" /> {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-4">Annual = 10 × monthly — 2 months free. {currency === "INR" ? "Billed in INR, GST extra." : "Billed in USD."}</p>
    </div>
  );
}

const INTL_TIERS = [
  { tier: "starter", title: "Starter", tagline: "For independent & small salons", primary: false,
    items: ["Online booking & CRM", "POS billing", "Email & WhatsApp reminders", "Email support"] },
  { tier: "professional", title: "Professional", tagline: "For growing salons", primary: true,
    items: ["Everything in Starter", "Inventory & vendors", "Staff payroll & commissions", "Analytics & reports", "Multi-staff accounts"] },
  { tier: "premium", title: "Premium AI", tagline: "For salons wanting Mira AI + automation", primary: false,
    items: ["Everything in Professional", "Mira AI receptionist", "AI marketing studio", "Review automation", "Staff verification registry"] },
];

function buildIntlPlans(c) {
  const price = (key) => c?.[key]?.price ?? null;
  const keys = { starter: "intl_starter", professional: "intl_pro", premium: "intl_premium" };
  const anyHl = Object.entries(c || {}).some(([k, v]) => k.startsWith("intl_") && v?.highlight);
  const tiers = INTL_TIERS.filter(t => !c || c[`${keys[t.tier]}_monthly`]).map(t => {
    const k = keys[t.tier];
    const v = c?.[`${k}_monthly`];
    return { ...t, key: `${k}_monthly`, monthly: price(`${k}_monthly`), annual: price(`${k}_annual`),
      items: v?.features?.length ? v.features : t.items, primary: anyHl ? !!v?.highlight : t.primary };
  });
  return [...tiers, ...customPlanCards(c, "USD")];
}

const durLabel = (days, cur) => {
  const m = Math.round((days || 30) / 30.4);
  return m >= 12 && m % 12 === 0 ? `for ${m / 12} year${m > 12 ? "s" : ""}` : m <= 1 ? "per month" : `for ${m} months`;
};

function customPlanCards(c, currency, vertical = "salon") {
  return Object.entries(c || {})
    .filter(([, v]) => v && typeof v === "object" && v.custom && (v.currency || "INR") === currency && (v.vertical || "salon") === vertical)
    .sort((a, b) => (a[1].price || 0) - (b[1].price || 0))
    .map(([key, v]) => ({
      key, title: v.label, price: currency === "USD" ? fmtUSD(v.price) : fmtINR(v.price), monthly: v.price, annual: null,
      per: `${durLabel(v.duration_days)}${(v.branches || 1) > 1 ? ` · ${v.branches} branches` : ""}`, cta: "Get started", primary: !!v.highlight,
      tagline: v.branches > 1 ? "For salon chains" : "All-in-one salon suite",
      items: v.features?.length ? v.features : ["All features included", currency === "USD" ? "Email & chat support" : "WhatsApp support", "Cancel anytime"],
    }));
}

function buildPlans(c) {
  if (!c) return PLANS;
  const mo = c.monthly?.price, qt = c.quarter?.price, an = c.annual?.price;
  const b2a = c.two_branch_annual?.price, b3a = c.three_branch_annual?.price, b5a = c.multi_branch_annual?.price;
  const anyMulti = b2a || b3a || b5a;
  const kept = PLANS.filter(p => (p.key === "trial") || (p.key === "monthly" ? !!mo : p.key === "quarter" ? !!qt : p.key === "annual" ? !!an : p.key === "multi_branch" ? !!anyMulti : true));
  const catKey = (k) => (k === "multi_branch" ? "two_branch_annual" : k);
  const anyHl = Object.entries(c).some(([k, v]) => v && typeof v === "object" && v.highlight && !k.startsWith("intl_") && !k.startsWith("resto_"));
  const decorate = (p) => {
    const v = c[catKey(p.key)];
    return { ...p, items: v?.features?.length ? v.features : p.items, primary: anyHl ? !!v?.highlight : p.primary };
  };
  return [...kept.map(p => {
    if (p.key === "trial" && c.trial_days) return { ...p, per: `${c.trial_days} days` };
    if (p.key === "monthly" && mo) return { ...p, price: fmtINR(mo) };
    if (p.key === "quarter" && qt) return { ...p, price: fmtINR(qt), per: mo && mo * 3 > qt ? `for 3 months — save ${fmtINR(mo * 3 - qt)}` : "for 3 months · flexible" };
    if (p.key === "annual" && an) return { ...p, price: fmtINR(an), per: mo && mo * 12 > an ? `for 1 year — save ${fmtINR(mo * 12 - an)} (1 month free)` : "for 1 year" };
    if (p.key === "multi_branch" && b2a) return {
      ...p, price: `from ${fmtINR(b2a)}`,
      per: `2 branches ${kINR(b2a)}/yr · 3 branches ${kINR(b3a)}/yr · 5+ ${kINR(b5a)}/yr`,
    };
    return p;
  }).map(decorate), ...customPlanCards(c, "INR")];
}

const TESTIMONIALS = [
  { name: "Kavita R.", role: "Owner · Bangalore", img: "https://images.pexels.com/photos/17163945/pexels-photo-17163945.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=160&w=160",
    quote: "Bookings doubled in a month. Mira answers my clients at midnight while I sleep." },
  { name: "Farhan S.", role: "Unisex Salon · Pune", img: "https://images.pexels.com/photos/8834025/pexels-photo-8834025.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=160&w=160",
    quote: "GST bills, staff salaries, inventory — I closed three other apps and my notebook." },
];

const Label = ({ children, className = "" }) => (
  <span className={`text-xs uppercase tracking-[0.25em] font-outfit font-semibold ${className}`}>{children}</span>
);

export const WHO_CAN_USE = [
  "Unisex & Family Salons", "Ladies & Gents Salons", "Spas & Massage Centers", "Beauty Parlours",
  "Boutiques & Designer Studios", "Barbershops", "Nail Studios", "Makeup & Bridal Studios",
  "Tattoo & Piercing Studios", "Wellness & Ayurveda Centers", "Skin & Hair Clinics", "Mehendi Artists",
];

export const LogoLockup = ({ size = "md" }) => (
  <Link to="/" className="flex items-center gap-3 group shrink-0" data-testid="landing-logo">
    <img src="/assets/ms-logo-ring.png" alt="Miracurl Suite"
      className={`${size === "lg" ? "w-24 h-24" : "w-10 h-10 sm:w-14 sm:h-14 xl:w-[72px] xl:h-[72px]"} gold-shine-img group-hover:scale-105 transition-transform`} />
    <span className="leading-tight">
      <span className={`block font-playfair ${size === "lg" ? "text-2xl" : "text-sm sm:text-lg"} tracking-[0.08em] gold-shine-text font-semibold whitespace-nowrap`}>
        MIRACURL <span className="tracking-[0.3em]">SUITE</span>
      </span>
      <span className="hidden sm:block text-[9px] uppercase tracking-[0.3em] text-slate-500">Salon & Restaurant Management Software</span>
    </span>
  </Link>
);



function CeoSection({ site }) {
  if (!site) return null;
  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pb-24" data-testid="ceo-section">
      <div className="relative rounded-3xl border border-[#e9d9ae] overflow-hidden bg-white shadow-[0_30px_80px_-40px_rgba(184,134,59,0.5)]">
        <div className="pointer-events-none absolute -right-20 -top-20 w-72 h-72 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle at 30% 30%, #f5d78e, #e8918f 55%, transparent 75%)" }} />
        <div className="pointer-events-none absolute -left-24 -bottom-24 w-72 h-72 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle at 60% 40%, #e8b96a, #ec4899 60%, transparent 80%)" }} />
        <div className="relative flex flex-col md:flex-row items-center gap-8 p-8 sm:p-12">
          <div className="shrink-0">
            <div className="w-44 h-44 rounded-3xl overflow-hidden border-2 border-[#e0c07a] shadow-[0_20px_60px_-15px_rgba(184,134,59,0.35)] bg-amber-50">
              {site.ceo_photo ? (
                <img src={site.ceo_photo} alt={site.ceo_name} className="w-full h-full object-cover" data-testid="ceo-photo" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#c9a24a]">
                  <Crown className="w-14 h-14" />
                </div>
              )}
            </div>
          </div>
          <div className="text-center md:text-left">
            <Label className="text-[#a87e2f]">Meet the Founder</Label>
            <h2 className="font-playfair text-3xl sm:text-4xl font-light mt-3 text-slate-900">{site.ceo_name}</h2>
            <p className="text-sm text-[#a87e2f] mt-1 font-medium">{site.ceo_title}</p>
            <p className="text-slate-600 mt-4 max-w-xl leading-relaxed line-clamp-5" data-testid="ceo-about">{site.ceo_about}</p>
            <Link to="/ceo" data-testid="ceo-read-more"
              className="mt-2 inline-block text-sm font-semibold text-[#a87e2f] hover:text-[#8a6420] transition-colors">
              Read full story →
            </Link>
            <div className="flex items-center justify-center md:justify-start gap-3 mt-5">
              {site.ceo_facebook && (
                <a href={site.ceo_facebook} target="_blank" rel="noreferrer" data-testid="ceo-facebook-link"
                  className="w-9 h-9 rounded-full border border-[#e0c07a]/60 bg-amber-50 flex items-center justify-center text-[#8a6420] hover:text-sky-400 hover:border-sky-400/50 transition-colors">
                  <Facebook className="w-4 h-4" />
                </a>
              )}
              {site.ceo_instagram && (
                <a href={site.ceo_instagram} target="_blank" rel="noreferrer" data-testid="ceo-instagram-link"
                  className="w-9 h-9 rounded-full border border-[#e0c07a]/60 bg-amber-50 flex items-center justify-center text-[#8a6420] hover:text-[#E35A89] hover:border-[#E35A89]/50 transition-colors">
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {site.ceo_linkedin && (
                <a href={site.ceo_linkedin} target="_blank" rel="noreferrer" data-testid="ceo-linkedin-link"
                  className="w-9 h-9 rounded-full border border-[#e0c07a]/60 bg-amber-50 flex items-center justify-center text-[#8a6420] hover:text-[#a87e2f] hover:border-[#DFB78C]/50 transition-colors">
                  <Linkedin className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


function TrustNumbersStrip({ label, stats }) {
  if (!stats) return null;
  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k+` : `${n}`;
  const items = [
    { label: "Salons on Miracurl", value: fmt(stats.salons) },
    { label: "Cities", value: fmt(stats.cities) },
    { label: "Bookings processed", value: fmt(stats.bookings) },
    { label: "Bills generated", value: fmt(stats.invoices) },
  ];
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pb-6" data-testid="trust-numbers-strip">
      <div className="rounded-3xl border border-[#e0c07a] bg-gradient-to-r from-[#fff8ea] via-white to-[#fff8ea] px-6 sm:px-10 py-8">
        <div className="text-center text-[10px] tracking-[0.35em] uppercase text-[#a87e2f] mb-6">{label}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map(it => (
            <div key={it.label} className="text-center" data-testid={`trust-stat-${it.label.toLowerCase().replace(/ /g, "-")}`}>
              <div className="font-playfair text-3xl sm:text-4xl text-slate-900">{it.value}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-1.5">{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustedPartnersSection() {
  const [partners, setPartners] = useState([]);
  useEffect(() => {
    api.get("/public/partners").then(r => setPartners(r.data)).catch(() => {});
  }, []);
  if (!partners.length) return null;
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pb-24" data-testid="trusted-partners-section">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
        <div>
          <Label className="text-emerald-700">Our Trusted Partners</Label>
          <p className="text-sm text-slate-500 mt-3 max-w-xl">Salons already growing on Miracurl — rated by their own customers.</p>
        </div>
        <Link to="/partners" data-testid="view-all-partners-link"
          className="inline-flex items-center gap-1.5 text-xs text-[#a87e2f] hover:text-[#7a5a1e] transition-colors font-medium">
          View all partners <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <Suspense fallback={null}><PartnerGrid partners={partners} compact /></Suspense>
    </section>
  );
}

function VideoLightbox({ open, onClose }) {
  const onKey = useCallback((e) => { if (e.key === "Escape") onClose(); }, [onClose]);
  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onKey]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-10" data-testid="tour-video-lightbox" onClick={onClose}>
      <button onClick={onClose} data-testid="tour-video-close"
        className="absolute top-5 right-5 z-10 w-11 h-11 rounded-full bg-white/10 border border-white/30 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
        <X className="w-5 h-5" />
      </button>
      <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <video src="/miracurl-full-tour.mp4" controls autoPlay playsInline data-testid="tour-video-player"
          className="w-full rounded-2xl border border-[#e0c07a]/70 shadow-[0_40px_120px_-20px_rgba(223,183,140,0.25)]" />
        <p className="text-center text-xs text-slate-500 mt-4">Miracurl — the complete 2-minute product tour</p>
      </div>
    </div>
  );
}

export default function Landing({ scrollTo }) {
  const [refSlug, setRefSlug] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [region, setRegion] = useState(currentRegion); // in | intl
  const pickRegion = (k) => { setRegion(k); rememberRegion(k); };
  const us = region === "intl";
  const copy = COPY[us ? "intl" : "in"];
  const [liveTestimonials, setLiveTestimonials] = useState([]);
  const [site, setSite] = useState(null);
  const [stats, setStats] = useState(null);
  const plans = buildPlans(catalog);
  const intlPlans = buildIntlPlans(catalog);
  const testimonials = liveTestimonials.length > 0
    ? liveTestimonials.map(t => ({
        name: t.owner_name,
        role: `${t.salon_name}${t.city ? ` · ${t.city}` : ""}`,
        img: t.photo_url || `https://ui-avatars.com/api/?background=fff7e6&color=b8863b&name=${encodeURIComponent(t.owner_name)}`,
        quote: t.quote,
      }))
    : TESTIMONIALS;
  useEffect(() => {
    api.get("/public/plans").then(r => setCatalog(r.data)).catch(() => {});
    api.get("/public/testimonials").then(r => setLiveTestimonials(r.data.testimonials || [])).catch(() => {});
    api.get("/public/site-info").then(r => setSite(r.data)).catch(() => {});
    api.get("/public/platform-stats").then(r => setStats(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    const device = window.matchMedia("(max-width: 640px)").matches ? "mobile" : "desktop";
    if (typeof window.gtag === "function") window.gtag("set", "user_properties", { region, device });
    track("landing_view", { region, device, page: window.location.pathname });
  }, [region]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get("ref") || "").trim().toLowerCase();
    if (ref) { localStorage.setItem("miracurl_ref", ref); setRefSlug(ref); }
    else { const stored = localStorage.getItem("miracurl_ref"); if (stored) setRefSlug(stored); }
  }, []);
  useEffect(() => {
    if (!scrollTo) return;
    const t = setTimeout(() => document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth" }), 350);
    return () => clearTimeout(t);
  }, [scrollTo]);
  const salonFrom = us ? (catalog?.intl_starter_monthly?.price != null ? `$${catalog.intl_starter_monthly.price}` : "") : (catalog?.monthly?.price != null ? fmtINR(catalog.monthly.price) : "");
  const restoFrom = restoPlans(catalog, us ? "USD" : "INR")[0]?.price || "";

  return (
    <div className="relative min-h-screen bg-[#fdf9f4] text-slate-800 font-outfit overflow-x-clip" data-testid="landing-page">
      <div className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-amber-200/60 via-rose-200/50 to-transparent blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute top-[38%] -left-40 w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-rose-100/60 via-amber-100/50 to-transparent blur-3xl" aria-hidden="true" />
      <div className="relative z-10">
      {refSlug && (
        <div className="bg-[#C89B52] text-white text-sm py-2 px-4 text-center font-medium" data-testid="landing-ref-banner">
          <Gift className="w-4 h-4 inline -mt-0.5 mr-1.5" /> Referred by <b>{refSlug}</b> — they'll earn a free month when you subscribe.
        </div>
      )}

      <SiteHeader variant="light" site={site} subtitle="Salon & Restaurant Management Software" signupTo={signupHref("salon", region)} signupLabel={copy.navCta} peekHref="#peek" />

      <TwoDoorHero region={region} trialDays={Number(catalog?.trial_days) || 30} salonFrom={salonFrom} restoFrom={restoFrom} stats={stats} />

      <VerticalSection id="salon" vertical="salon" region={region} demoPath={copy.demoBookPath} />
      <div id="features" />
      <VerticalSection id="restaurant" vertical="restaurant" region={region} demoPath="/restaurant" />

      {/* Quick peek — salon + restaurant screens */}
      <div id="peek">
        <Suspense fallback={null}><DemoCarousel /></Suspense>
        <Suspense fallback={null}><RestoDemoCarousel /></Suspense>
      </div>

      {/* Tour video */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 py-10">
        <button onClick={() => setVideoOpen(true)} data-testid="hero-video-play"
          className="group relative block w-full aspect-video rounded-3xl overflow-hidden border border-[#e9d9ae] bg-white shadow-[0_40px_100px_-40px_rgba(184,134,59,0.5)] hover:border-[#C89B52]/60 transition-colors">
          <img src={IMG.videoPoster} alt="Miracurl product tour preview" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-[1.02] transition-transform duration-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="relative w-20 h-20 rounded-full bg-[#C89B52] text-white flex items-center justify-center shadow-[0_0_50px_rgba(200,155,82,0.6)] group-hover:scale-110 transition-transform duration-300">
              <Play className="w-8 h-8 ml-1 fill-current" />
            </span>
          </span>
          <span className="absolute bottom-5 left-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 backdrop-blur text-sm text-slate-800 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-[#C89B52]" /> Watch the 2-min product tour
          </span>
        </button>
      </section>
      <VideoLightbox open={videoOpen} onClose={() => setVideoOpen(false)} />

      <TrustNumbersStrip label={copy.trustLabel} stats={stats} />
      {us ? <UsWhySwitch /> : (
      <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pb-20">
        <Label className="text-[#a87e2f]">Owners on Miracurl</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">
          {testimonials.map((t, i) => (
            <figure key={t.id || `${t.name}-${i}`} data-testid={`testimonial-card-${i + 1}`}
                    className="rounded-3xl bg-white border border-[#e9d9ae] p-8 hover:border-[#C89B52]/60 transition-colors">
              <div className="flex gap-1 text-[#C89B52]">{["s1", "s2", "s3", "s4", "s5"].map(s => <Star key={s} className="w-4 h-4 fill-[#C89B52]" />)}</div>
              <blockquote className="font-playfair text-xl md:text-2xl leading-relaxed mt-4 text-slate-800">"{t.quote}"</blockquote>
              <figcaption className="flex items-center gap-3 mt-6">
                <img src={t.img} alt={t.name} loading="lazy" decoding="async" className="w-11 h-11 rounded-full object-cover border border-[#e9d9ae]" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      )}

      <TrustedPartnersSection />
      <Suspense fallback={null}><MiracurlProductsStrip light /></Suspense>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 py-16">
        <div className="text-center mb-14">
          <Label className="text-[#E35A89]">Pricing</Label>
          <h2 className="font-playfair text-4xl sm:text-5xl font-light mt-4">Simple pricing — salons & restaurants</h2>
          <p className="text-slate-500 mt-4 max-w-xl mx-auto text-sm">No per-booking fees, no commissions on your sales. Salon plans first, restaurant plans right below — same toggle.</p>
          <div className="inline-flex items-center gap-1 mt-7 p-1 rounded-full bg-amber-50/60 border border-[#e9d9ae]" data-testid="pricing-region-toggle">
            {[["in", "🇮🇳 India · ₹"], ["intl", "🌍 International · $"]].map(([k, l]) => (
              <button key={k} data-testid={`pricing-region-${k}`} onClick={() => pickRegion(k)}
                className={`px-5 py-2 rounded-full text-xs font-semibold transition-colors ${region === k
                  ? "bg-[#C89B52] text-white"
                  : "text-slate-600 hover:text-slate-900"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {region === "in" ? (
        <>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${plans.length >= 5 ? "lg:grid-cols-5" : plans.length === 4 ? "lg:grid-cols-4" : plans.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {plans.map(p => (
            <div key={p.key} data-testid={`plan-${p.key}`}
                 className={`rounded-3xl p-7 relative bg-white border transition-colors ${p.primary
                   ? "border-[#C89B52] shadow-[0_30px_80px_-40px_rgba(184,134,59,0.6)]"
                   : "border-[#e9d9ae] hover:border-[#C89B52]/60"}`}>
              {p.primary && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-[#C89B52] text-white text-[10px] uppercase tracking-widest font-bold">Best value</div>}
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">{p.title}</div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-bold font-playfair text-[#a87e2f]">{p.price}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{p.per}</div>
              <ul className="mt-6 space-y-2.5">
                {p.items.map(i => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" /> {i}
                  </li>
                ))}
              </ul>
              <Link to={signupHref("salon", "in")} onClick={() => trackCta(`plan-cta-${p.key}`, { region: "in" })} data-testid={`plan-cta-${p.key}`}
                    className={`mt-7 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5 ${p.primary
                      ? "bg-[#C89B52] text-white hover:bg-[#b8863b] shadow-[0_10px_28px_-8px_rgba(223,183,140,0.5)]"
                      : "border border-[#e0c07a]/70 text-slate-800 hover:bg-amber-50"}`}>
                {p.cta} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
        <RestaurantPlans catalog={catalog} currency="INR" region={region} />
        </>
        ) : (
        <>
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-5 mx-auto ${intlPlans.length > 3 ? "lg:grid-cols-4 max-w-6xl" : "max-w-5xl"}`}>
          {intlPlans.map(p => (
            <div key={p.key} data-testid={`plan-${p.key}`}
                 className={`rounded-3xl p-7 relative bg-white border transition-colors ${p.primary
                   ? "border-[#C89B52] shadow-[0_30px_80px_-40px_rgba(184,134,59,0.6)]"
                   : "border-[#e9d9ae] hover:border-[#C89B52]/60"}`}>
              {p.primary && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-[#C89B52] text-white text-[10px] uppercase tracking-widest font-bold">Most popular</div>}
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">{p.title}</div>
              <div className="text-xs text-slate-500 mt-1" data-testid={`plan-tagline-${p.key}`}>{p.tagline}</div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-bold font-playfair text-[#a87e2f]">{fmtUSD(p.monthly)}</span>
                <span className="text-sm text-slate-400 mb-1.5">{p.annual ? "/mo" : p.per}</span>
              </div>
              {p.annual && <div className="text-xs text-slate-400 mt-2" data-testid={`plan-annual-${p.key}`}>
                or <b className="text-slate-800">{fmtUSD(p.annual)}/yr</b> {p.monthly && p.monthly * 12 > p.annual && <span className="text-emerald-600">— save {fmtUSD(p.monthly * 12 - p.annual)} a year</span>}
              </div>}
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/25 text-[11px] text-emerald-700 font-medium" data-testid={`plan-trial-badge-${p.key}`}>
                <Check className="w-3 h-3" /> 30-day free trial · no card needed
              </div>
              <ul className="mt-6 space-y-2.5">
                {p.items.map(i => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" /> {i}
                  </li>
                ))}
              </ul>
              <Link to={signupHref("salon", "intl")} onClick={() => trackCta(`plan-cta-${p.key}`, { region: "intl" })} data-testid={`plan-cta-${p.key}`}
                    className={`mt-7 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5 ${p.primary
                      ? "bg-[#C89B52] text-white hover:bg-[#b8863b] shadow-[0_10px_28px_-8px_rgba(223,183,140,0.5)]"
                      : "border border-[#e0c07a]/70 text-slate-800 hover:bg-amber-50"}`}>
                Start free trial <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
        <div className="max-w-5xl mx-auto mt-6 rounded-2xl border border-[#e0c07a] bg-amber-50/70 p-6 sm:p-8" data-testid="plan-intl-enterprise">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[3px] text-[#a87e2f] font-semibold">Managing 5+ branches?</p>
              <h3 className="mt-1.5 text-xl sm:text-2xl font-semibold text-slate-900">Enterprise for Multi-Branch Chains</h3>
              <p className="text-xs text-slate-500 mt-1">For multi-location & larger operations</p>
              <p className="text-sm text-slate-600 mt-1.5">
                Starting from <b className="text-[#a87e2f]">{fmtUSD(catalog?.intl_enterprise_monthly?.price ?? 399)}/month</b> — or custom annual contracts tailored to your chain.
              </p>
              <ul className="mt-4 grid sm:grid-cols-3 gap-2.5">
                {["Centralized bookings & billing", "AI marketing on autopilot", "Unlimited staff & branches"].map(f => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-slate-600">
                    <Check className="w-4 h-4 text-[#a87e2f] mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-[#e9d9ae] bg-amber-50/60 pl-1.5 pr-4 py-1.5" data-testid="enterprise-consultant-chip">
                <span className="w-8 h-8 rounded-full bg-amber-100 text-[#a87e2f] flex items-center justify-center text-sm">👨‍💼</span>
                <span className="text-[12px] text-slate-600 leading-tight">
                  <b className="text-slate-900">Bablu Kumar</b> · Enterprise Consultant
                  <span className="block text-[10px] text-emerald-600">● Usually replies within 5 minutes</span>
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:w-72 flex-shrink-0">
              <Link to="/demo" data-testid="enterprise-book-demo"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold text-[#050505] bg-[#DFB78C] shadow-[0_0_26px_-6px_rgba(223,183,140,0.65)] hover:bg-[#b8863b] hover:-translate-y-0.5 transition-transform">
                📞 Book a Demo
              </Link>
              <a href={`https://wa.me/919180379552?text=${encodeURIComponent("Hi! I run a multi-branch salon chain and I'd like to know about Miracurl Enterprise plans.")}`}
                target="_blank" rel="noreferrer" data-testid="enterprise-whatsapp"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold text-slate-900 bg-[#25D366] shadow-[0_0_22px_-8px_rgba(37,211,102,0.7)] hover:-translate-y-0.5 transition-transform">
                💬 Chat on WhatsApp
              </a>
              <button onClick={() => window.dispatchEvent(new Event("open-sales-chat"))} data-testid="enterprise-ask-mira"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-[13px] font-semibold text-[#a87e2f] border border-[#C89B52]/60 hover:bg-amber-50 transition-colors">
                ✦ Ask Mira — instant answers
              </button>
            </div>
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-5">Prices in USD for clients outside India (US, UK, UAE, Canada, Australia & more). Billed via secure international payment link.</p>
        <RestaurantPlans catalog={catalog} currency="USD" region={region} />
        </>
        )}
      </section>


      {/* Meet the Founder / About Us */}
      <div id="about"><CeoSection site={site} /></div>

      {/* Final CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 pb-24">
        <div className="rounded-3xl p-10 sm:p-16 text-center relative overflow-hidden border border-[#e0c07a]"
             style={{ background: "linear-gradient(135deg, rgba(227,90,137,0.10) 0%, rgba(200,155,82,0.14) 100%)" }}>
          <Zap className="w-10 h-10 mx-auto text-[#a87e2f]" />
          <h2 className="font-playfair text-3xl sm:text-5xl font-light mt-5">{copy.finalH2}</h2>
          <p className="text-slate-600 mt-4 max-w-xl mx-auto">{copy.finalSub}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-9">
            <Link to={signupHref("restaurant", region)} onClick={() => trackCta("landing-cta-footer-resto", { region })} data-testid="landing-cta-footer-resto"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold hover:brightness-110 hover:-translate-y-1 transition-transform">
              Restaurant free month <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to={signupHref("salon", region)} onClick={() => trackCta("landing-cta-footer", { region })} data-testid="landing-cta-footer"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#C89B52] text-white font-bold hover:bg-[#b8863b] hover:-translate-y-1 transition-transform shadow-[0_16px_40px_-10px_rgba(223,183,140,0.6)]">
              Salon free trial <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={() => setVideoOpen(true)} data-testid="footer-watch-tour-btn"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-[#e0c07a] text-slate-800 font-medium hover:bg-amber-50 transition-colors">
              <Play className="w-4 h-4 text-[#a87e2f] fill-[#C89B52]" /> Watch the 2-min tour
            </button>
          </div>
        </div>
      </section>


      {/* Footer — professional columns + massive typography */}
      <footer className="relative z-10 border-t border-[#e9d9ae] pt-16 pb-8 overflow-hidden" data-testid="landing-footer">
        <div className="max-w-7xl mx-auto px-6 sm:px-10">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-12">
            <div>
              <LogoLockup />
              <p className="text-xs text-slate-500 mt-4 leading-relaxed max-w-xs">
                Salon & restaurant management software — booking, POS, CRM, staff payroll and Mira AI in one premium suite.
              </p>
              <div className="flex items-center gap-2.5 mt-5">
                {site?.instagram && (
                  <a href={site.instagram} target="_blank" rel="noreferrer" data-testid="footer-instagram"
                    className="w-9 h-9 rounded-full border border-[#e0c07a]/70 bg-amber-50/60 flex items-center justify-center text-slate-600 hover:text-[#E35A89] hover:border-[#E35A89]/50 transition-colors">
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {site?.facebook && (
                  <a href={site.facebook} target="_blank" rel="noreferrer" data-testid="footer-facebook"
                    className="w-9 h-9 rounded-full border border-[#e0c07a]/70 bg-amber-50/60 flex items-center justify-center text-slate-600 hover:text-sky-400 hover:border-sky-400/50 transition-colors">
                    <Facebook className="w-4 h-4" />
                  </a>
                )}
                {site?.youtube && (
                  <a href={site.youtube} target="_blank" rel="noreferrer" data-testid="footer-youtube"
                    className="w-9 h-9 rounded-full border border-[#e0c07a]/70 bg-amber-50/60 flex items-center justify-center text-slate-600 hover:text-red-400 hover:border-red-400/50 transition-colors">
                    <Play className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
            <div>
              <Label className="text-[#a87e2f]">Company</Label>
              <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-500">
                <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
                <a href="#about" className="hover:text-slate-900 transition-colors">About Us</a>
                <Link to="/contact-us" className="hover:text-slate-900 transition-colors" data-testid="footer-contact-link">Contact Us</Link>
                <Link to="/partners" className="hover:text-slate-900 transition-colors">Our Partners</Link>
                <Link to="/blog" className="hover:text-slate-900 transition-colors" data-testid="footer-blog-link">Blog</Link>
              </div>
            </div>
            <div>
              <Label className="text-[#a87e2f]">Product</Label>
              <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-500">
                <Link to="/features" className="hover:text-slate-900 transition-colors">Features</Link>
                <Link to="/pricing" className="hover:text-slate-900 transition-colors">Pricing</Link>
                <Link to="/staff-registry" className="hover:text-slate-900 transition-colors">Staff Verification (Free)</Link>
                <Link to={signupHref("salon", region)} className="hover:text-slate-900 transition-colors">Start Free Trial</Link>
                <Link to="/login" className="hover:text-slate-900 transition-colors">Sign In</Link>
              </div>
            </div>
            <div>
              <Label className="text-[#a87e2f]">Contact</Label>
              <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-500">
                <a href={`mailto:${site?.contact_email || "admin@miracurl-suite.com"}`} data-testid="footer-email"
                  className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                  <Mail className="w-3.5 h-3.5 text-[#a87e2f]" /> {site?.contact_email || "admin@miracurl-suite.com"}
                </a>
                {site?.whatsapp && (
                  <a href={`https://wa.me/${(site.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp us
                  </a>
                )}
                <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-[#E35A89]" /> Marathahalli, Bangalore</span>
              </div>
              <div className="mt-5">
                <Label className="text-emerald-700 !text-[10px]">Who can use</Label>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  {WHO_CAN_USE.join(" · ")}
                </p>
                <Link to="/who-can-use" data-testid="footer-who-can-use-link"
                  className="mt-2 inline-block text-[11px] font-semibold text-emerald-700/80 hover:text-emerald-200 transition-colors">
                  See all with photos →
                </Link>
              </div>
            </div>
          </div>
          <div className="font-playfair text-[13vw] md:text-[9vw] leading-none text-[#C89B52]/[0.10] select-none whitespace-nowrap" aria-hidden="true">
            MIRACURL SUITE <span className="text-[#a87e2f]/20">✦</span>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-[#DFB78C]/40 to-transparent" />
          <div className="pt-6 text-center">
            <span className="text-xs uppercase tracking-[0.3em] text-[#a87e2f] font-semibold" data-testid="footer-features-title">✦ Our Features ✦</span>
          </div>
          <div className="pt-4 pb-2 flex flex-wrap justify-center gap-2 text-xs" data-testid="footer-features-strip">
            {["Appointments", "Staff & Payroll", "Inventory", "Marketing", "Reports", "POS & Billing", "Mira AI", "Promo Studio", "AI Assistant", "Online Booking", "Gift Cards", "Memberships", "Reviews"].map((f) => (
              <span key={f}
                className="px-3 py-1.5 rounded-full border border-[#e9d9ae] bg-white text-slate-500 select-none">
                ✦ {f}
              </span>
            ))}
          </div>
          <div className="mt-6 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2"><img src="/assets/ms-logo-ring.png" alt="MS" className="w-6 h-6 object-contain" /> © {new Date().getFullYear()} Miracurl Suite · Manage. Automate. Grow.</div>
            <div className="flex items-center gap-5 flex-wrap justify-center">
              <Link to="/terms-of-service" className="hover:text-slate-900 transition-colors" data-testid="footer-terms-link">Terms</Link>
              <Link to="/privacy-policy" className="hover:text-slate-900 transition-colors" data-testid="footer-privacy-link">Privacy</Link>
              <Link to="/refund-policy" className="hover:text-slate-900 transition-colors" data-testid="footer-refund-link">Refunds</Link>
            </div>
          </div>
        </div>
      </footer>
      <SalesChatWidget />
      <InstallAppPrompt variant="app" />
      {us && <UsStickyCta />}
      </div>
    </div>
  );
}

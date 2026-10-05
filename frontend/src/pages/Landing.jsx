import { Link } from "react-router-dom";
import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Star, ArrowRight, Check, Sparkles, Gift, Zap, Play, X, Mail, Instagram, Facebook, Linkedin, Crown, MessageSquare, MapPin } from "lucide-react";
import SalesChatWidget from "@/components/SalesChatWidget";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import api from "@/lib/api";
import { currentRegion, rememberRegion, signupHref, hasRegionChoice, resolveGeoRegion } from "@/lib/region";
import { track, trackCta } from "@/lib/analytics";
import { COPY } from "@/components/landing/landingCopy";
import { UsWhySwitch, UsStickyCta } from "@/components/landing/UsLanding";
import { TwoDoorHero } from "@/components/landing/TwoDoorHero";
import { VerticalSection } from "@/components/landing/VerticalSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { restoPlans, fmtINR } from "@/components/landing/pricingData";
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
    // No explicit ₹/$ choice yet → refine the timezone guess with the visitor's IP country.
    if (!hasRegionChoice()) resolveGeoRegion().then(r => { if (r) setRegion(r); });
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

      <PricingSection region={region} pickRegion={pickRegion} catalog={catalog} salonFrom={salonFrom} restoFrom={restoFrom} />

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

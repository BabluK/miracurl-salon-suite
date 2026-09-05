import { Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { Calendar, Receipt, Star, ArrowRight, Check, Sparkles, MessageSquare, Scissors, Gift, ShieldCheck, Wand2, MapPin, UserCog, Mic, BadgePercent, Zap, BarChart3, Package, Play, X, ChevronDown, Mail, Instagram, Facebook, Linkedin, Crown } from "lucide-react";
import SalesChatWidget from "@/components/SalesChatWidget";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import { DemoCarousel } from "@/components/DemoCarousel";
import { PartnerGrid } from "@/components/PartnerGrid";
import { SoftwareFlowSection } from "@/components/SoftwareFlowSection";
import { MiraStudioShowcase } from "@/components/MiraStudioShowcase";
import { MiracurlProductsStrip } from "@/components/MiracurlProductsStrip";
import api from "@/lib/api";
import { detectRegion } from "@/lib/region";

const IMG = {
  hero: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/98878cd0ea553bd4df7cc6ca3c05eaea3bd83533c44c0b7b2785932491d9d440.jpeg",
  videoPoster: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/394d0556e2556ee48e48994393cc5d31c76c9d7a2c7b34c01b50bd6d2995cee9.jpeg",
  mira: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/0edf7cea5fd92564bf4bc69be15455570ba5f75f85561ee7bd0cdca2578254cc.png",
  pos: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/65e892308ec77806aafab7631f043393928bd5918a8b0fc0debb8ee8782bc338.png",
};

const SMALL_FEATURES = [
  { icon: Calendar, title: "Online Booking 24/7", desc: "Clients self-book in 5 taps — WhatsApp link, stylist-level slots, zero double-booking." },
  { icon: MessageSquare, title: "WhatsApp Confirmations", desc: "One-tap confirmations, reminders & review links with approval workflow." },
  { icon: Star, title: "Reviews → ₹ Credits", desc: "4★+ reviews earn ₹50 credit — lifts your Google rating on autopilot." },
  { icon: Gift, title: "Refer & Earn", desc: "Referral codes reward both sides — clients bring clients." },
  { icon: Wand2, title: "AI Brand Studio", desc: "AI logo & promo posters applied to your page in one tap." },
  { icon: MapPin, title: "Multi-Branch", desc: "Every branch with phone & directions, branch-tagged billing." },
  { icon: UserCog, title: "Roles & Staff Portal", desc: "Attendance, commissions, salary slips — managers restricted from finances." },
  { icon: BarChart3, title: "Reports + Commission", desc: "Daily & monthly revenue, per-stylist performance emailed weekly." },
  { icon: Package, title: "Inventory & Vendors", desc: "Low-stock alerts with one-click vendor restock emails." },
  { icon: Receipt, title: "POS Billing & CRM", desc: "Multi-tab billing, GST invoices, discounts and full customer visit history." },
  { icon: Check, title: "Staff Check-in / Check-out", desc: "Daily attendance with check-in & check-out, week-offs, leave and late alerts." },
  { icon: Crown, title: "Staff Payroll", desc: "Automated salaries, commissions, fines and downloadable salary slips." },
  { icon: ShieldCheck, title: "Verified Staff Registry", desc: "Cross-salon staff verification with badges, ID cards and work history." },
  { icon: Mic, title: "Booking with Mira AI", desc: "Mira answers calls & chats 24/7 and books appointments for your clients." },
  { icon: Sparkles, title: "Mira Beauty Advisory", desc: "AI beauty advice that recommends the right services & products to every guest." },
  { icon: Play, title: "Staff Entertainment", desc: "Music & entertainment hub that keeps your team energised between clients." },
];

const PLANS = [
  { key: "trial", title: "Free Trial", price: "₹0", per: "30 days", cta: "Start trial", primary: false,
    items: ["All features unlocked", "Up to 50 customers", "Email support", "Cancel anytime"] },
  { key: "half_year", title: "6-Month Plan", price: "₹12,000", per: "for 6 months", cta: "Get started", primary: false,
    items: ["Unlimited customers", "Unlimited bookings", "Per-stylist commission", "WhatsApp support", "All features"] },
  { key: "annual", title: "Annual Plan", price: "₹20,000", per: "for 1 year — save ₹4,000", cta: "Best value", primary: true,
    items: ["Everything in 6-Month", "12 months access", "Priority support", "Custom branding next year"] },
  { key: "multi_branch", title: "Multi-Branch", price: "from ₹40,000", per: "2 branches ₹40k/yr (₹24k/6mo) · 3 branches ₹60k/yr (₹36k/6mo) · 5+ ₹70k/yr", cta: "For salon chains", primary: false,
    items: ["Everything in Annual", "5+ branches, one account", "Branch-wise reports", "Dedicated onboarding"] },
];

const fmtINR = (n) => "₹" + Number(n).toLocaleString("en-IN");
const kINR = (n) => "₹" + Math.round(n / 1000) + "k";
const fmtUSD = (n) => "$" + Number(n).toLocaleString("en-US");

const INTL_TIERS = [
  { tier: "starter", title: "Starter", primary: false,
    items: ["Online booking & CRM", "POS billing", "WhatsApp reminders", "Email support"] },
  { tier: "professional", title: "Professional", primary: true,
    items: ["Everything in Starter", "Inventory & vendors", "Staff payroll & commissions", "Analytics & reports", "Multi-staff accounts"] },
  { tier: "premium", title: "Premium AI", primary: false,
    items: ["Everything in Professional", "Mira AI receptionist", "AI marketing studio", "Review automation", "Staff verification registry"] },
];

function buildIntlPlans(c) {
  const price = (key, fallback) => c?.[key]?.price ?? fallback;
  const defaults = { starter: [79, 399, 699], professional: [149, 799, 1399], premium: [249, 1299, 2399] };
  const keys = { starter: "intl_starter", professional: "intl_pro", premium: "intl_premium" };
  return INTL_TIERS.map(t => {
    const [m, h, a] = defaults[t.tier];
    const k = keys[t.tier];
    return {
      ...t, key: `${k}_monthly`,
      monthly: price(`${k}_monthly`, m), half: price(`${k}_half`, h), annual: price(`${k}_annual`, a),
    };
  });
}

function buildPlans(c) {
  if (!c) return PLANS;
  const hy = c.half_year?.price, an = c.annual?.price;
  const b2a = c.two_branch_annual?.price, b2h = c.two_branch_half?.price;
  const b3a = c.three_branch_annual?.price, b3h = c.three_branch_half?.price, b5a = c.multi_branch_annual?.price;
  return PLANS.map(p => {
    if (p.key === "trial" && c.trial_days) return { ...p, per: `${c.trial_days} days` };
    if (p.key === "half_year" && hy) return { ...p, price: fmtINR(hy) };
    if (p.key === "annual" && an) return { ...p, price: fmtINR(an), per: hy && hy * 2 > an ? `for 1 year — save ${fmtINR(hy * 2 - an)}` : "for 1 year" };
    if (p.key === "multi_branch" && b2a) return {
      ...p, price: `from ${fmtINR(b2a)}`,
      per: `2 branches ${kINR(b2a)}/yr (${kINR(b2h)}/6mo) · 3 branches ${kINR(b3a)}/yr (${kINR(b3h)}/6mo) · 5+ ${kINR(b5a)}/yr`,
    };
    return p;
  });
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
    <img src="/assets/ms-logo-emblem.png" alt="Miracurl Suite"
      className={`${size === "lg" ? "w-24 h-24" : "w-10 h-10 sm:w-14 sm:h-14 xl:w-[72px] xl:h-[72px]"} gold-shine-img group-hover:scale-105 transition-transform`} />
    <span className="leading-tight">
      <span className={`block font-playfair ${size === "lg" ? "text-2xl" : "text-sm sm:text-lg"} tracking-[0.08em] gold-shine-text font-semibold whitespace-nowrap`}>
        MIRACURL <span className="tracking-[0.3em]">SUITE</span>
      </span>
      <span className="hidden sm:block text-[9px] uppercase tracking-[0.3em] text-white/45">Smart Salon Management Software</span>
    </span>
  </Link>
);

function ExploreDropdown() {
  const [open, setOpen] = useState(false);
  return (
    <div className="nav-cap relative hidden sm:block"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((v) => !v)} data-testid="nav-explore-btn"
        className="flex items-center gap-1 uppercase text-white/70 hover:text-white transition-colors">
        Explore <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-3 w-[220px]" data-testid="nav-explore-dropdown">
          <div className="rounded-2xl border border-[#DFB78C]/25 bg-[#0b0a08]/95 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] p-2">
            <Link to="/features" data-testid="nav-features-link" className="block px-3 py-2.5 rounded-xl text-sm text-white/80 hover:bg-[#DFB78C]/10 hover:text-[#DFB78C] transition-colors">✦ Features</Link>
            <Link to="/pricing" data-testid="nav-pricing-link" className="block px-3 py-2.5 rounded-xl text-sm text-white/80 hover:bg-[#DFB78C]/10 hover:text-[#DFB78C] transition-colors">💰 Pricing</Link>
            <a href="/products" data-testid="nav-products-link" className="block px-3 py-2.5 rounded-xl text-sm text-white/80 hover:bg-[#DFB78C]/10 hover:text-[#DFB78C] transition-colors">🧴 Our Products</a>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactDropdown({ site }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="nav-cap relative hidden sm:block"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((v) => !v)} data-testid="nav-contact-btn"
        className="flex items-center gap-1 uppercase text-white/70 hover:text-white transition-colors">
        Contact Us <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full pt-3 w-[340px]" data-testid="nav-contact-dropdown">
          <div className="rounded-2xl border border-[#DFB78C]/25 bg-[#0b0a08]/95 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] p-5 space-y-4">
            <div>
              <Label className="text-[#DFB78C]">Get in touch</Label>
              <div className="mt-3 space-y-2 text-sm">
                <a href={`mailto:${site?.contact_email || "admin@miracurl-suite.com"}`} data-testid="contact-email-link"
                  className="flex items-center gap-2.5 text-white/80 hover:text-[#DFB78C] transition-colors">
                  <Mail className="w-4 h-4 text-[#DFB78C]" /> {site?.contact_email || "admin@miracurl-suite.com"}
                </a>
                {site?.instagram && (
                  <a href={site.instagram} target="_blank" rel="noreferrer" data-testid="contact-instagram-link"
                    className="flex items-center gap-2.5 text-white/80 hover:text-[#DFB78C] transition-colors">
                    <Instagram className="w-4 h-4 text-[#E35A89]" /> Instagram
                  </a>
                )}
                {site?.facebook && (
                  <a href={site.facebook} target="_blank" rel="noreferrer" data-testid="contact-facebook-link"
                    className="flex items-center gap-2.5 text-white/80 hover:text-[#DFB78C] transition-colors">
                    <Facebook className="w-4 h-4 text-sky-400" /> Facebook
                  </a>
                )}
                {site?.whatsapp && (
                  <a href={`https://wa.me/${(site.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" data-testid="contact-whatsapp-link"
                    className="flex items-center gap-2.5 text-white/80 hover:text-[#DFB78C] transition-colors">
                    <MessageSquare className="w-4 h-4 text-emerald-400" /> WhatsApp
                  </a>
                )}
              </div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <Label className="text-emerald-300">Who can use Miracurl</Label>
              <div className="mt-3 flex flex-wrap gap-1.5" data-testid="who-can-use-list">
                {WHO_CAN_USE.slice(0, 6).map((w) => (
                  <span key={w} className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/65">{w}</span>
                ))}
              </div>
              <Link to="/who-can-use" data-testid="who-can-use-page-link"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 transition-colors">
                See all business types with photos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="border-t border-white/10 pt-4">
              <Link to="/contact-us" data-testid="contact-page-link"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#DFB78C] hover:text-[#EAD3B3] transition-colors">
                Visit the Contact Us page <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
                  className="w-9 h-9 rounded-full border border-[#e0c07a]/60 bg-amber-50 flex items-center justify-center text-[#8a6420] hover:text-[#DFB78C] hover:border-[#DFB78C]/50 transition-colors">
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


function TrustNumbersStrip() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/public/platform-stats").then(r => setStats(r.data)).catch(() => {});
  }, []);
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
      <div className="rounded-3xl border border-[#DFB78C]/25 bg-gradient-to-r from-[#151310] via-[#0F0F10] to-[#151310] px-6 sm:px-10 py-8">
        <div className="text-center text-[10px] tracking-[0.35em] uppercase text-[#DFB78C] mb-6">Trusted by salons across India</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map(it => (
            <div key={it.label} className="text-center" data-testid={`trust-stat-${it.label.toLowerCase().replace(/ /g, "-")}`}>
              <div className="font-playfair text-3xl sm:text-4xl text-white">{it.value}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1.5">{it.label}</div>
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
          <Label className="text-emerald-300">Our Trusted Partners</Label>
          <p className="text-sm text-white/50 mt-3 max-w-xl">Salons already growing on Miracurl — rated by their own customers.</p>
        </div>
        <Link to="/partners" data-testid="view-all-partners-link"
          className="inline-flex items-center gap-1.5 text-xs text-[#DFB78C] hover:text-[#EAD3B3] transition-colors font-medium">
          View all partners <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <PartnerGrid partners={partners} compact />
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
        className="absolute top-5 right-5 z-10 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
        <X className="w-5 h-5" />
      </button>
      <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <video src="/miracurl-full-tour.mp4" controls autoPlay playsInline data-testid="tour-video-player"
          className="w-full rounded-2xl border border-white/15 shadow-[0_40px_120px_-20px_rgba(223,183,140,0.25)]" />
        <p className="text-center text-xs text-white/50 mt-4">Miracurl — the complete 2-minute product tour</p>
      </div>
    </div>
  );
}

export default function Landing({ scrollTo }) {
  const [refSlug, setRefSlug] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [region, setRegion] = useState(() => {
    try { return localStorage.getItem("miracurl_region") || detectRegion(); } catch { return "in"; }
  }); // in | intl
  const pickRegion = (k) => { setRegion(k); try { localStorage.setItem("miracurl_region", k); } catch { /* private mode */ } };
  const [liveTestimonials, setLiveTestimonials] = useState([]);
  const [site, setSite] = useState(null);
  const plans = buildPlans(catalog);
  const intlPlans = buildIntlPlans(catalog);
  const testimonials = liveTestimonials.length > 0
    ? liveTestimonials.map(t => ({
        name: t.owner_name,
        role: `${t.salon_name}${t.city ? ` · ${t.city}` : ""}`,
        img: t.photo_url || `https://ui-avatars.com/api/?background=1c1917&color=fbbf24&name=${encodeURIComponent(t.owner_name)}`,
        quote: t.quote,
      }))
    : TESTIMONIALS;
  useEffect(() => {
    api.get("/public/plans").then(r => setCatalog(r.data)).catch(() => {});
    api.get("/public/testimonials").then(r => setLiveTestimonials(r.data.testimonials || [])).catch(() => {});
    api.get("/public/site-info").then(r => setSite(r.data)).catch(() => {});
  }, []);
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

  return (
    <div className="min-h-screen bg-[#050505] text-white font-outfit overflow-x-clip" data-testid="landing-page">
      {/* Referral banner — slim, elegant, top of everything */}
      {refSlug && (
        <div className="bg-[#DFB78C] text-black text-sm py-2 px-4 text-center font-medium" data-testid="landing-ref-banner">
          <Gift className="w-4 h-4 inline -mt-0.5 mr-1.5" /> Referred by <b>{refSlug}</b> — they'll earn a free month when you subscribe.
        </div>
      )}

      {/* Nav — crystal glass with the new gold monogram */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/70 border-b border-[#DFB78C]/15">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 xl:px-10 py-2 flex items-center justify-between">
          <LogoLockup />
          <div className="hidden xl:flex items-center gap-4 2xl:gap-6 text-sm pr-1">
            <Link to="/" data-testid="nav-home-link" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="nav-cap text-white/70 hover:text-white transition-colors">Home</Link>
            <a href="#about" data-testid="nav-about-link" className="nav-cap text-white/70 hover:text-white transition-colors">About Us</a>
            <Link to="/mira.ai" data-testid="nav-mira-studio-link"
              className="nav-cap flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#DFB78C]/40 bg-[#DFB78C]/10 text-[#DFB78C] hover:bg-[#DFB78C]/20 font-medium transition-colors">
              ✦ Mira AI Studio
            </Link>
            <ExploreDropdown />
            <Link to="/restaurant" data-testid="nav-restaurant-link" className="nav-cap text-[#DFB78C] hover:text-[#F0D9A5] font-medium transition-colors">🍽️ For Restaurants</Link>
            <Link to="/staff-registry" data-testid="landing-verify-staff" className="nav-cap text-emerald-400 hover:text-emerald-300 font-medium transition-colors">Staff Verification</Link>
            <ContactDropdown site={site} />
            <Link to="/login" className="nav-cap text-white/70 hover:text-white font-medium transition-colors" data-testid="landing-login">Sign In</Link>
            <Link to="/signup-salon" data-testid="landing-cta-nav"
                  className="nav-cap px-4 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#050505] font-bold hover:brightness-110 hover:-translate-y-0.5 shadow-[0_8px_24px_-6px_rgba(223,183,140,0.5)] transition-transform">
              Sign Up
            </Link>
          </div>
          <div className="flex xl:hidden items-center gap-2 sm:gap-3 text-sm whitespace-nowrap shrink-0">
            <Link to="/contact-us" data-testid="nav-contact-mobile" className="hidden min-[430px]:block text-white/70 hover:text-white transition-colors">Contact</Link>
            <Link to="/login" className="text-white/70 hover:text-white font-medium transition-colors">Sign In</Link>
            <Link to="/signup-salon"
                  className="px-3 sm:px-4 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#050505] text-xs font-bold shadow-[0_8px_24px_-6px_rgba(223,183,140,0.5)]">
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — cinematic with smart AI background */}
      <section className="relative overflow-hidden">
        <img src={IMG.hero} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/70" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 20%, rgba(5,5,5,0.25) 0%, rgba(5,5,5,0.92) 80%)" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pt-20 sm:pt-28 pb-44 sm:pb-56 text-center animate-fade-up">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-black/50 border border-white/15 backdrop-blur text-[#DFB78C] text-[11px] uppercase tracking-[0.2em] font-semibold">
            <Sparkles className="w-3 h-3" /> {Number(catalog?.trial_days) || 30}-Day Free Trial · No credit card
          </span>
          <img src="/assets/ms-logo-emblem.png" alt="Miracurl Suite" className="w-20 h-20 mx-auto mt-8 drop-shadow-[0_8px_30px_rgba(223,183,140,0.45)] animate-fade-up" />
          <h1 className="font-playfair text-5xl sm:text-6xl lg:text-7xl tracking-tight font-light mt-6 leading-[1.05]">
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-[#F5DFA8] via-[#DFB78C] to-[#B8863B]">Manage. Automate. Grow.</span>
          </h1>
          <p className="text-white/70 text-lg md:text-xl mt-7 max-w-2xl mx-auto font-light">
            <b className="text-[#EAD3B3] font-medium">Miracurl Suite</b> — smart salon management software.
            Appointments, POS billing, CRM, staff payroll and Mira AI in one premium suite,
            built for salons, spas and every beauty business.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link to="/signup-salon" data-testid="landing-cta-hero"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#DFB78C] text-[#050505] font-bold hover:bg-[#EAD3B3] hover:-translate-y-1 shadow-[0_16px_40px_-10px_rgba(223,183,140,0.6)] transition-transform text-base">
              Start your free trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/book/miracurl-marathahalli" data-testid="landing-demo-btn"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-white/25 bg-black/30 backdrop-blur text-white/90 font-medium hover:bg-white/10 hover:-translate-y-1 transition-transform">
              See a live booking page
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/50">
            {["Unlimited bookings", "GST billing built-in", "WhatsApp share built-in"].map(t => (
              <span key={t} className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> {t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Floating tour video card — overlaps hero into the next section */}
      <section className="relative z-20 max-w-4xl mx-auto px-6 sm:px-10 -mt-32 sm:-mt-44">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-10 mx-auto max-w-lg rounded-full bg-[#E35A89]/15 blur-3xl" aria-hidden="true" />
          <button onClick={() => setVideoOpen(true)} data-testid="hero-video-play"
            className="group relative block w-full aspect-video rounded-3xl overflow-hidden border border-white/15 bg-black/60 backdrop-blur-xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] hover:border-[#DFB78C]/50 transition-colors">
            <img src={IMG.videoPoster} alt="Miracurl product tour preview" className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-95 group-hover:scale-[1.02] transition-transform duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="relative flex items-center justify-center">
                <span className="absolute w-24 h-24 rounded-full bg-[#DFB78C]/30 animate-ping" style={{ animationDuration: "2.2s" }} />
                <span className="relative w-20 h-20 rounded-full bg-[#DFB78C] text-[#050505] flex items-center justify-center shadow-[0_0_50px_rgba(223,183,140,0.6)] group-hover:scale-110 transition-transform duration-300">
                  <Play className="w-8 h-8 ml-1 fill-current" />
                </span>
              </span>
            </span>
            <span className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur border border-white/15 text-sm text-white/90 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-[#DFB78C]" /> Watch the full product tour
              </span>
              <span className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/15 text-xs text-white/70 font-mono">2:00</span>
            </span>
          </button>
        </div>
      </section>
      <VideoLightbox open={videoOpen} onClose={() => setVideoOpen(false)} />

      {/* Stats strip */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 mt-16 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {[{ v: "₹0", l: "Setup cost" }, { v: "90 sec", l: "To go live" }, { v: "24/7", l: "AI receptionist" }, { v: "0%", l: "Booking commission" }].map((s, i) => (
            <div key={s.l} className={`px-4 py-6 text-center hover:bg-white/[0.04] transition-colors ${i < 3 ? "sm:border-r sm:border-white/10" : ""} ${i % 2 === 0 ? "border-r border-white/10 sm:border-r" : ""} ${i < 2 ? "border-b border-white/10 sm:border-b-0" : ""}`}>
              <div className="text-2xl sm:text-3xl font-playfair text-[#DFB78C]">{s.v}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1.5">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <DemoCarousel />

      {/* Features — bento grid */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 py-24">
        <div className="text-left mb-14 max-w-2xl">
          <Label className="text-[#E35A89]">Everything you need</Label>
          <h2 className="font-playfair text-4xl sm:text-5xl font-light mt-4">Built for how Indian salons <em className="text-[#DFB78C] not-italic font-playfair">actually</em> work</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Mira AI — large card */}
          <div className="md:col-span-8 md:row-span-2 relative overflow-hidden rounded-3xl bg-[#0F0F10] border border-white/10 group hover:border-[#DFB78C]/30 transition-colors" data-testid="feature-mira-ai">
            <img src={IMG.mira} alt="" aria-hidden="true" className="absolute right-0 bottom-0 w-2/3 md:w-1/2 object-contain opacity-80 group-hover:scale-105 transition-transform duration-700" />
            <div className="relative p-8 md:p-12 max-w-md">
              <span className="inline-flex items-center gap-1.5 text-[#DFB78C] text-[11px] uppercase tracking-[0.2em] font-semibold"><Sparkles className="w-3.5 h-3.5" /> Your AI employee</span>
              <h3 className="font-playfair text-3xl md:text-4xl mt-3">Mira AI ✦</h3>
              <p className="text-white/60 mt-4 leading-relaxed">Voice briefings in English &amp; Hindi, AI poster studio, review replies — and a 24/7 booking agent that chats with your clients and fills your calendar.</p>
              <div className="flex flex-wrap gap-2 mt-6">
                {[[Mic, "Voice booking"], [Calendar, "Slot-aware"], [BadgePercent, "Upsells offers"]].map(([I, t]) => (
                  <span key={t} className="inline-flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-full px-3 py-1.5 text-xs text-white/80"><I className="w-3.5 h-3.5 text-[#E35A89]" /> {t}</span>
                ))}
              </div>
              <a href="/book/miracurl-marathahalli" target="_blank" rel="noreferrer" data-testid="mira-try-live-btn"
                 className="inline-flex items-center gap-2 mt-8 px-5 py-2.5 rounded-full bg-[#DFB78C] text-[#050505] font-semibold text-sm hover:bg-[#EAD3B3] hover:-translate-y-0.5 transition-transform">
                Try Mira live <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
          {/* Smart POS */}
          <div className="md:col-span-4 relative overflow-hidden rounded-3xl bg-[#0F0F10] border border-white/10 group hover:border-[#DFB78C]/30 transition-colors min-h-[220px]" data-testid="feature-smart-pos">
            <img src={IMG.pos} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-55 transition-opacity duration-500" />
            <div className="relative p-8">
              <Receipt className="w-6 h-6 text-[#DFB78C]" />
              <h3 className="font-playfair text-2xl mt-3">Smart POS</h3>
              <p className="text-white/60 text-sm mt-2">GST billing, thermal receipts with Google-review QR, multi-stylist invoices.</p>
            </div>
          </div>
          {/* Staff Registry */}
          <div className="md:col-span-4 rounded-3xl bg-[#0F0F10] border border-white/10 p-8 hover:border-[#DFB78C]/30 transition-colors" data-testid="feature-staff-registry">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <h3 className="font-playfair text-2xl mt-3">Staff Registry</h3>
            <p className="text-white/60 text-sm mt-2">Aadhaar-verified cross-salon history, geo-fenced attendance, auto badges + PDF.</p>
          </div>
          {/* Wide booking card */}
          <div className="md:col-span-12 rounded-3xl bg-gradient-to-r from-[#0F0F10] to-[#E35A89]/[0.08] border border-white/10 p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6 hover:border-[#E35A89]/30 transition-colors" data-testid="feature-online-booking">
            <div className="flex-1">
              <h3 className="font-playfair text-2xl md:text-3xl">24/7 Online Booking · PWA Apps · Loyalty</h3>
              <p className="text-white/60 text-sm mt-2 max-w-2xl">Your own /book page clients install like an app. Loyalty points, memberships, packages and birthday emails keep them coming back.</p>
            </div>
            <Link to="/signup-salon" className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[#E35A89]/50 text-[#E35A89] text-sm font-semibold hover:bg-[#E35A89]/10 transition-colors" data-testid="feature-booking-cta">
              Get your page <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {/* Small feature tiles */}
          {SMALL_FEATURES.map(f => {
            const I = f.icon;
            return (
              <div key={f.title} className="md:col-span-4 rounded-3xl bg-[#0F0F10] border border-white/10 p-7 hover:border-[#DFB78C]/30 hover:-translate-y-1 transition-transform duration-300" data-testid={`feature-${f.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <I className="w-5 h-5 text-[#DFB78C]" />
                <h3 className="font-playfair text-xl mt-3">{f.title}</h3>
                <p className="text-white/50 text-sm mt-2 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Mira AI Studio — built with AI showcase */}
      <MiraStudioShowcase />

      {/* Software flow — neon 3D timeline */}
      <SoftwareFlowSection />

      {/* Testimonials — editorial */}
      <TrustNumbersStrip />
      <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pb-24">
        <Label className="text-[#DFB78C]">Salon owners on Miracurl</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">
          {testimonials.map((t, i) => (
            <figure key={t.id || `${t.name}-${i}`} data-testid={`testimonial-card-${i + 1}`}
                    className="rounded-3xl bg-[#0F0F10] border border-white/10 p-8 hover:border-[#DFB78C]/30 transition-colors">
              <div className="flex gap-1 text-[#DFB78C]">{["s1", "s2", "s3", "s4", "s5"].map(s => <Star key={s} className="w-4 h-4 fill-[#DFB78C]" />)}</div>
              <blockquote className="font-playfair text-xl md:text-2xl leading-relaxed mt-4 text-white/90">"{t.quote}"</blockquote>
              <figcaption className="flex items-center gap-3 mt-6">
                <img src={t.img} alt={t.name} className="w-11 h-11 rounded-full object-cover border border-white/20" />
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-white/50">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Trusted Partners — onboarded salons, auto-listed */}
      <TrustedPartnersSection />

      {/* Miracurl Products — hair science range */}
      <MiracurlProductsStrip />

      {/* Pricing */}
      <section id="pricing" className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pb-24">
        <div className="text-center mb-14">
          <Label className="text-[#E35A89]">Pricing</Label>
          <h2 className="font-playfair text-4xl sm:text-5xl font-light mt-4">Simple, salon-friendly</h2>
          <p className="text-white/50 mt-4 max-w-xl mx-auto text-sm">No per-booking fees, no commissions on your sales. Pay once, use everything.</p>
          <div className="inline-flex items-center gap-1 mt-7 p-1 rounded-full bg-white/5 border border-white/10" data-testid="pricing-region-toggle">
            {[["in", "🇮🇳 India · ₹"], ["intl", "🌍 International · $"]].map(([k, l]) => (
              <button key={k} data-testid={`pricing-region-${k}`} onClick={() => pickRegion(k)}
                className={`px-5 py-2 rounded-full text-xs font-semibold transition-colors ${region === k
                  ? "bg-[#DFB78C] text-[#050505]"
                  : "text-white/60 hover:text-white"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {region === "in" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map(p => (
            <div key={p.key} data-testid={`plan-${p.key}`}
                 className={`rounded-3xl p-7 relative bg-[#0F0F10] border transition-colors ${p.primary
                   ? "border-[#DFB78C]/60 shadow-[0_0_40px_rgba(223,183,140,0.15)]"
                   : "border-white/10 hover:border-white/25"}`}>
              {p.primary && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-[#DFB78C] text-[#050505] text-[10px] uppercase tracking-widest font-bold">Best value</div>}
              <div className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">{p.title}</div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-bold font-playfair text-[#DFB78C]">{p.price}</span>
              </div>
              <div className="text-xs text-white/40 mt-1">{p.per}</div>
              <ul className="mt-6 space-y-2.5">
                {p.items.map(i => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> {i}
                  </li>
                ))}
              </ul>
              <Link to="/signup-salon?region=in" data-testid={`plan-cta-${p.key}`}
                    className={`mt-7 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5 ${p.primary
                      ? "bg-[#DFB78C] text-[#050505] hover:bg-[#EAD3B3] shadow-[0_10px_28px_-8px_rgba(223,183,140,0.5)]"
                      : "border border-white/15 text-white/85 hover:bg-white/5"}`}>
                {p.cta} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
        ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {intlPlans.map(p => (
            <div key={p.key} data-testid={`plan-${p.key}`}
                 className={`rounded-3xl p-7 relative bg-[#0F0F10] border transition-colors ${p.primary
                   ? "border-[#DFB78C]/60 shadow-[0_0_40px_rgba(223,183,140,0.15)]"
                   : "border-white/10 hover:border-white/25"}`}>
              {p.primary && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-[#DFB78C] text-[#050505] text-[10px] uppercase tracking-widest font-bold">Most popular</div>}
              <div className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">{p.title}</div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-bold font-playfair text-[#DFB78C]">{fmtUSD(p.monthly)}</span>
                <span className="text-sm text-white/40 mb-1.5">/mo</span>
              </div>
              <div className="text-xs text-white/40 mt-2 space-y-0.5">
                <div>6 months: <b className="text-white/80">{fmtUSD(p.half)}</b> <span className="text-emerald-400">save {fmtUSD(p.monthly * 6 - p.half)}</span></div>
                <div>1 year: <b className="text-white/80">{fmtUSD(p.annual)}</b> <span className="text-emerald-400">save {fmtUSD(p.monthly * 12 - p.annual)}</span></div>
              </div>
              <ul className="mt-6 space-y-2.5">
                {p.items.map(i => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> {i}
                  </li>
                ))}
              </ul>
              <Link to="/signup-salon?region=intl" data-testid={`plan-cta-${p.key}`}
                    className={`mt-7 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5 ${p.primary
                      ? "bg-[#DFB78C] text-[#050505] hover:bg-[#EAD3B3] shadow-[0_10px_28px_-8px_rgba(223,183,140,0.5)]"
                      : "border border-white/15 text-white/85 hover:bg-white/5"}`}>
                Start free trial <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
        <div className="max-w-5xl mx-auto mt-6 rounded-2xl border border-[#DFB78C]/25 bg-[#DFB78C]/[0.05] p-6 sm:p-8" data-testid="plan-intl-enterprise">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[3px] text-[#DFB78C]/80 font-semibold">Managing 5+ branches?</p>
              <h3 className="mt-1.5 text-xl sm:text-2xl font-semibold text-white">Enterprise for Multi-Branch Chains</h3>
              <p className="text-sm text-white/60 mt-1.5">
                Starting from <b className="text-[#DFB78C]">{fmtUSD(catalog?.intl_enterprise_monthly?.price ?? 499)}/month</b> — or custom annual contracts tailored to your chain.
              </p>
              <ul className="mt-4 grid sm:grid-cols-3 gap-2.5">
                {["Centralized bookings & billing", "AI marketing on autopilot", "Unlimited staff & branches"].map(f => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-white/70">
                    <Check className="w-4 h-4 text-[#DFB78C] mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] pl-1.5 pr-4 py-1.5" data-testid="enterprise-consultant-chip">
                <span className="w-8 h-8 rounded-full bg-[#DFB78C]/20 text-[#DFB78C] flex items-center justify-center text-sm">👨‍💼</span>
                <span className="text-[12px] text-white/70 leading-tight">
                  <b className="text-white">Bablu Kumar</b> · Enterprise Consultant
                  <span className="block text-[10px] text-emerald-400">● Usually replies within 5 minutes</span>
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:w-72 flex-shrink-0">
              <Link to="/demo" data-testid="enterprise-book-demo"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold text-[#050505] bg-[#DFB78C] shadow-[0_0_26px_-6px_rgba(223,183,140,0.65)] hover:bg-[#EAD3B3] hover:-translate-y-0.5 transition-transform">
                📞 Book a Demo
              </Link>
              <a href={`https://wa.me/919180261256?text=${encodeURIComponent("Hi! I run a multi-branch salon chain and I'd like to know about Miracurl Enterprise plans.")}`}
                target="_blank" rel="noreferrer" data-testid="enterprise-whatsapp"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold text-white bg-[#25D366] shadow-[0_0_22px_-8px_rgba(37,211,102,0.7)] hover:-translate-y-0.5 transition-transform">
                💬 Chat on WhatsApp
              </a>
              <button onClick={() => window.dispatchEvent(new Event("open-sales-chat"))} data-testid="enterprise-ask-mira"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-[13px] font-semibold text-[#DFB78C] border border-[#DFB78C]/40 hover:bg-[#DFB78C]/10 transition-colors">
                ✦ Ask Mira — instant answers
              </button>
            </div>
          </div>
        </div>
        <p className="text-center text-[11px] text-white/35 mt-5">Prices in USD for clients outside India (US, UK, UAE, Canada, Australia & more). Billed via secure international payment link.</p>
        </>
        )}
      </section>

      {/* Meet the Founder / About Us */}
      <div id="about"><CeoSection site={site} /></div>

      {/* Final CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 pb-24">
        <div className="rounded-3xl p-10 sm:p-16 text-center relative overflow-hidden border border-[#DFB78C]/20"
             style={{ background: "linear-gradient(135deg, rgba(227,90,137,0.12) 0%, rgba(223,183,140,0.10) 100%)" }}>
          <Zap className="w-10 h-10 mx-auto text-[#DFB78C]" />
          <h2 className="font-playfair text-3xl sm:text-5xl font-light mt-5">Ready to bring your salon online?</h2>
          <p className="text-white/60 mt-4 max-w-xl mx-auto">Set up in 90 seconds. Cancel anytime in your trial. Pay only when it works.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-9">
            <Link to="/signup-salon" data-testid="landing-cta-footer"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#DFB78C] text-[#050505] font-bold hover:bg-[#EAD3B3] hover:-translate-y-1 transition-transform shadow-[0_16px_40px_-10px_rgba(223,183,140,0.6)]">
              Start free trial <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={() => setVideoOpen(true)} data-testid="footer-watch-tour-btn"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-white/20 text-white/85 font-medium hover:bg-white/5 transition-colors">
              <Play className="w-4 h-4 text-[#DFB78C] fill-[#DFB78C]" /> Watch the 2-min tour
            </button>
          </div>
        </div>
      </section>

      {/* Footer — professional columns + massive typography */}
      <footer className="relative z-10 border-t border-[#DFB78C]/15 pt-16 pb-8 overflow-hidden" data-testid="landing-footer">
        <div className="max-w-7xl mx-auto px-6 sm:px-10">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-12">
            <div>
              <LogoLockup />
              <p className="text-xs text-white/45 mt-4 leading-relaxed max-w-xs">
                Smart salon management software — manage, automate and grow your beauty business with one premium suite.
              </p>
              <div className="flex items-center gap-2.5 mt-5">
                {site?.instagram && (
                  <a href={site.instagram} target="_blank" rel="noreferrer" data-testid="footer-instagram"
                    className="w-9 h-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-white/60 hover:text-[#E35A89] hover:border-[#E35A89]/50 transition-colors">
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {site?.facebook && (
                  <a href={site.facebook} target="_blank" rel="noreferrer" data-testid="footer-facebook"
                    className="w-9 h-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-white/60 hover:text-sky-400 hover:border-sky-400/50 transition-colors">
                    <Facebook className="w-4 h-4" />
                  </a>
                )}
                {site?.youtube && (
                  <a href={site.youtube} target="_blank" rel="noreferrer" data-testid="footer-youtube"
                    className="w-9 h-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-white/60 hover:text-red-400 hover:border-red-400/50 transition-colors">
                    <Play className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
            <div>
              <Label className="text-[#DFB78C]">Company</Label>
              <div className="mt-4 flex flex-col gap-2.5 text-sm text-white/55">
                <Link to="/" className="hover:text-white transition-colors">Home</Link>
                <a href="#about" className="hover:text-white transition-colors">About Us</a>
                <Link to="/contact-us" className="hover:text-white transition-colors" data-testid="footer-contact-link">Contact Us</Link>
                <Link to="/mira.ai" className="text-[#DFB78C]/70 hover:text-[#DFB78C] transition-colors">Mira AI Studio ✦</Link>
                <Link to="/partners" className="hover:text-white transition-colors">Our Partners</Link>
                <Link to="/blog" className="hover:text-white transition-colors" data-testid="footer-blog-link">Blog</Link>
              </div>
            </div>
            <div>
              <Label className="text-[#DFB78C]">Product</Label>
              <div className="mt-4 flex flex-col gap-2.5 text-sm text-white/55">
                <Link to="/features" className="hover:text-white transition-colors">Features</Link>
                <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
                <Link to="/staff-registry" className="hover:text-white transition-colors">Staff Verification (Free)</Link>
                <Link to="/signup-salon" className="hover:text-white transition-colors">Start Free Trial</Link>
                <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
              </div>
            </div>
            <div>
              <Label className="text-[#DFB78C]">Contact</Label>
              <div className="mt-4 flex flex-col gap-2.5 text-sm text-white/55">
                <a href={`mailto:${site?.contact_email || "admin@miracurl-suite.com"}`} data-testid="footer-email"
                  className="flex items-center gap-2 hover:text-white transition-colors">
                  <Mail className="w-3.5 h-3.5 text-[#DFB78C]" /> {site?.contact_email || "admin@miracurl-suite.com"}
                </a>
                {site?.whatsapp && (
                  <a href={`https://wa.me/${(site.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 hover:text-white transition-colors">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp us
                  </a>
                )}
                <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-[#E35A89]" /> Marathahalli, Bangalore</span>
              </div>
              <div className="mt-5">
                <Label className="text-emerald-300 !text-[10px]">Who can use</Label>
                <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
                  {WHO_CAN_USE.join(" · ")}
                </p>
                <Link to="/who-can-use" data-testid="footer-who-can-use-link"
                  className="mt-2 inline-block text-[11px] font-semibold text-emerald-300/80 hover:text-emerald-200 transition-colors">
                  See all with photos →
                </Link>
              </div>
            </div>
          </div>
          <div className="font-playfair text-[13vw] md:text-[9vw] leading-none text-white/[0.05] select-none whitespace-nowrap" aria-hidden="true">
            MIRACURL SUITE <span className="text-[#DFB78C]/20">✦</span>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-[#DFB78C]/40 to-transparent" />
          <div className="pt-6 text-center">
            <span className="text-xs uppercase tracking-[0.3em] text-[#DFB78C]/80 font-semibold" data-testid="footer-features-title">✦ Our Features ✦</span>
          </div>
          <div className="pt-4 pb-2 flex flex-wrap justify-center gap-2 text-xs" data-testid="footer-features-strip">
            {["Appointments", "Staff & Payroll", "Inventory", "Marketing", "Reports", "POS & Billing", "Mira AI", "Promo Studio", "AI Assistant", "Online Booking", "Gift Cards", "Memberships", "Reviews"].map((f) => (
              <span key={f}
                className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-white/55 select-none">
                ✦ {f}
              </span>
            ))}
          </div>
          <div className="mt-6 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
            <div className="flex items-center gap-2"><img src="/assets/ms-logo-emblem.png" alt="MS" className="w-6 h-6 object-contain" /> © {new Date().getFullYear()} Miracurl Suite · Manage. Automate. Grow.</div>
            <div className="flex items-center gap-5 flex-wrap justify-center">
              <Link to="/terms-of-service" className="hover:text-white transition-colors" data-testid="footer-terms-link">Terms</Link>
              <Link to="/privacy-policy" className="hover:text-white transition-colors" data-testid="footer-privacy-link">Privacy</Link>
              <Link to="/refund-policy" className="hover:text-white transition-colors" data-testid="footer-refund-link">Refunds</Link>
            </div>
          </div>
        </div>
      </footer>
      <SalesChatWidget />
      <InstallAppPrompt variant="app" />
    </div>
  );
}

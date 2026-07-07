import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Calendar, Receipt, Star, ArrowRight, Check, Sparkles, MessageSquare, Scissors, Gift, ShieldCheck, Wand2, MapPin, UserCog, Mic, BadgePercent, Zap, BarChart3, Package } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import SalesChatWidget from "@/components/SalesChatWidget";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import { DemoCarousel } from "@/components/DemoCarousel";

const IMG = {
  hero: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/5f277bf6c250f088f3edd106c237e68fc45cb57e393b44d9d947c28d4668ebdb.png",
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
];

const PLANS = [
  { key: "trial", title: "Free Trial", price: "₹0", per: "7 days", cta: "Start trial", primary: false,
    items: ["All features unlocked", "Up to 50 customers", "Email support", "Cancel anytime"] },
  { key: "half_year", title: "6-Month Plan", price: "₹12,000", per: "for 6 months", cta: "Get started", primary: false,
    items: ["Unlimited customers", "Unlimited bookings", "Per-stylist commission", "WhatsApp support", "All features"] },
  { key: "annual", title: "Annual Plan", price: "₹20,000", per: "for 1 year — save ₹4,000", cta: "Best value", primary: true,
    items: ["Everything in 6-Month", "12 months access", "Priority support", "Custom branding next year"] },
  { key: "multi_branch", title: "Multi-Branch (5+)", price: "₹70,000", per: "per year · ₹45,000 / 6 months", cta: "For salon chains", primary: false,
    items: ["Everything in Annual", "5+ branches, one account", "Branch-wise reports", "Dedicated onboarding"] },
];

const TESTIMONIALS = [
  { name: "Kavita R.", role: "Owner · Bangalore", img: "https://images.pexels.com/photos/17163945/pexels-photo-17163945.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=160&w=160",
    quote: "Bookings doubled in a month. Mira answers my clients at midnight while I sleep." },
  { name: "Farhan S.", role: "Unisex Salon · Pune", img: "https://images.pexels.com/photos/8834025/pexels-photo-8834025.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=160&w=160",
    quote: "GST bills, staff salaries, inventory — I closed three other apps and my notebook." },
];

const Label = ({ children, className = "" }) => (
  <span className={`text-xs uppercase tracking-[0.25em] font-outfit font-semibold ${className}`}>{children}</span>
);

export default function Landing() {
  const [refSlug, setRefSlug] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get("ref") || "").trim().toLowerCase();
    if (ref) { localStorage.setItem("miracurl_ref", ref); setRefSlug(ref); }
    else { const stored = localStorage.getItem("miracurl_ref"); if (stored) setRefSlug(stored); }
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-outfit" data-testid="landing-page">
      {/* Nav — crystal glass */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/60 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-4 flex items-center justify-between">
          <BrandMark variant="dark" size="md" />
          <div className="flex items-center gap-3 sm:gap-7 text-sm">
            <a href="#features" data-testid="nav-features-link" className="hidden sm:block text-white/70 hover:text-white transition-colors">Features</a>
            <a href="#pricing" data-testid="nav-pricing-link" className="hidden sm:block text-white/70 hover:text-white transition-colors">Pricing</a>
            <Link to="/staff-registry" data-testid="landing-verify-staff" className="hidden md:block text-emerald-400 hover:text-emerald-300 font-medium transition-colors">Verify Staff — Free</Link>
            <Link to="/login" className="hidden sm:block text-white/70 hover:text-white font-medium transition-colors" data-testid="landing-login">Sign in</Link>
            <Link to="/signup-salon" data-testid="landing-cta-nav"
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white text-xs sm:text-sm font-semibold hover:-translate-y-0.5 shadow-[0_8px_24px_-6px_rgba(217,70,239,0.6)] transition-transform">
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — cinematic */}
      <section className="relative overflow-hidden">
        <img src={IMG.hero} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.92) 75%)" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pt-24 sm:pt-36 pb-24 sm:pb-32 text-center">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/5 border border-white/15 backdrop-blur text-amber-300 text-[11px] uppercase tracking-[0.2em] font-semibold">
            <Sparkles className="w-3 h-3" /> 7-Day Free Trial · No credit card
          </span>
          <h1 className="font-playfair text-5xl sm:text-6xl lg:text-7xl tracking-tight mt-8 leading-[1.05]">
            The Gold Standard<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-fuchsia-400">for Modern Salons ✦</span>
          </h1>
          <p className="text-neutral-400 text-lg md:text-xl mt-7 max-w-2xl mx-auto font-light">
            Appointments, POS billing, CRM, staff payroll and Mira AI — one premium suite,
            built for Indian salons. Replace your notebook in 90 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link to="/signup-salon" data-testid="landing-cta-hero"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white font-semibold hover:-translate-y-1 shadow-[0_16px_40px_-10px_rgba(217,70,239,0.65)] transition-transform text-base">
              Start your free trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/book/miracurl-marathahalli" data-testid="landing-demo-btn"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-white/20 text-white/85 font-medium hover:bg-white/5 hover:-translate-y-1 transition-transform">
              See a live booking page
            </Link>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-neutral-500">
            {["Unlimited bookings", "GST billing built-in", "WhatsApp share built-in"].map(t => (
              <span key={t} className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> {t}</span>
            ))}
          </div>
          {refSlug && (
            <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400/10 border border-amber-300/30 text-amber-200 text-sm" data-testid="landing-ref-banner">
              <Gift className="w-4 h-4" /> Referred by <b className="mx-1">{refSlug}</b> — they'll earn ₹1,000 when you sign up.
            </div>
          )}
        </div>
      </section>

      {/* Stats strip */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 -mt-10 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{ v: "₹0", l: "Setup cost" }, { v: "90 sec", l: "To go live" }, { v: "24/7", l: "AI receptionist" }, { v: "0%", l: "Booking commission" }].map(s => (
            <div key={s.l} className="bg-white/[0.03] backdrop-blur-md rounded-2xl border border-white/10 px-4 py-5 text-center hover:bg-white/[0.06] transition-colors">
              <div className="text-2xl sm:text-3xl font-bold font-playfair text-amber-200">{s.v}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mt-1.5">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <DemoCarousel />

      {/* Features — bento grid */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 py-24">
        <div className="text-left mb-14 max-w-2xl">
          <Label className="text-fuchsia-400">Everything you need</Label>
          <h2 className="font-playfair text-4xl sm:text-5xl mt-4">Built for how Indian salons <em className="text-amber-200 not-italic font-playfair">actually</em> work</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Mira AI — large card */}
          <div className="md:col-span-8 md:row-span-2 relative overflow-hidden rounded-3xl bg-white/[0.03] border border-white/10 group hover:bg-white/[0.06] transition-colors" data-testid="feature-mira-ai">
            <img src={IMG.mira} alt="" aria-hidden="true" className="absolute right-0 bottom-0 w-2/3 md:w-1/2 object-contain opacity-80 group-hover:scale-105 transition-transform duration-700" />
            <div className="relative p-8 md:p-12 max-w-md">
              <span className="inline-flex items-center gap-1.5 text-amber-300 text-[11px] uppercase tracking-[0.2em] font-semibold"><Sparkles className="w-3.5 h-3.5" /> Your AI employee</span>
              <h3 className="font-playfair text-3xl md:text-4xl mt-3">Mira AI ✦</h3>
              <p className="text-neutral-400 mt-4 leading-relaxed">Voice briefings in English &amp; Hindi, AI poster studio, review replies — and a 24/7 booking agent that chats with your clients and fills your calendar.</p>
              <div className="flex flex-wrap gap-2 mt-6">
                {[[Mic, "Voice booking"], [Calendar, "Slot-aware"], [BadgePercent, "Upsells offers"]].map(([I, t]) => (
                  <span key={t} className="inline-flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-full px-3 py-1.5 text-xs text-white/80"><I className="w-3.5 h-3.5 text-fuchsia-400" /> {t}</span>
                ))}
              </div>
              <a href="/book/miracurl-marathahalli" target="_blank" rel="noreferrer" data-testid="mira-try-live-btn"
                 className="inline-flex items-center gap-2 mt-8 px-5 py-2.5 rounded-full bg-amber-300 text-black font-semibold text-sm hover:-translate-y-0.5 transition-transform">
                Try Mira live <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
          {/* Smart POS */}
          <div className="md:col-span-4 relative overflow-hidden rounded-3xl bg-white/[0.03] border border-white/10 group hover:bg-white/[0.06] transition-colors min-h-[220px]" data-testid="feature-smart-pos">
            <img src={IMG.pos} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-55 transition-opacity duration-500" />
            <div className="relative p-8">
              <Receipt className="w-6 h-6 text-amber-300" />
              <h3 className="font-playfair text-2xl mt-3">Smart POS</h3>
              <p className="text-neutral-400 text-sm mt-2">GST billing, thermal receipts with Google-review QR, multi-stylist invoices.</p>
            </div>
          </div>
          {/* Staff Registry */}
          <div className="md:col-span-4 rounded-3xl bg-white/[0.03] border border-white/10 p-8 hover:bg-white/[0.06] transition-colors" data-testid="feature-staff-registry">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <h3 className="font-playfair text-2xl mt-3">Staff Registry</h3>
            <p className="text-neutral-400 text-sm mt-2">Aadhaar-verified cross-salon history, geo-fenced attendance, auto badges + PDF.</p>
          </div>
          {/* Wide booking card */}
          <div className="md:col-span-12 rounded-3xl bg-gradient-to-r from-white/[0.05] to-fuchsia-500/[0.06] border border-white/10 p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6 hover:border-fuchsia-500/30 transition-colors" data-testid="feature-online-booking">
            <div className="flex-1">
              <h3 className="font-playfair text-2xl md:text-3xl">24/7 Online Booking · PWA Apps · Loyalty</h3>
              <p className="text-neutral-400 text-sm mt-2 max-w-2xl">Your own /book page clients install like an app. Loyalty points, memberships, packages and birthday emails keep them coming back.</p>
            </div>
            <Link to="/signup-salon" className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full border border-fuchsia-400/50 text-fuchsia-300 text-sm font-semibold hover:bg-fuchsia-500/10 transition-colors" data-testid="feature-booking-cta">
              Get your page <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {/* Small feature tiles */}
          {SMALL_FEATURES.map(f => {
            const I = f.icon;
            return (
              <div key={f.title} className="md:col-span-4 rounded-3xl bg-white/[0.03] border border-white/10 p-7 hover:bg-white/[0.06] hover:-translate-y-1 transition-all duration-300" data-testid={`feature-${f.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <I className="w-5 h-5 text-amber-300" />
                <h3 className="font-playfair text-xl mt-3">{f.title}</h3>
                <p className="text-neutral-500 text-sm mt-2 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Testimonials — editorial */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pb-24">
        <Label className="text-amber-300">Salon owners on Miracurl</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">
          {TESTIMONIALS.map((t, i) => (
            <figure key={t.name} data-testid={`testimonial-card-${i + 1}`}
                    className="rounded-3xl bg-white/[0.03] border border-white/10 p-8 hover:bg-white/[0.06] transition-colors">
              <div className="flex gap-1 text-amber-300">{[...Array(5)].map((_, s) => <Star key={s} className="w-4 h-4 fill-amber-300" />)}</div>
              <blockquote className="font-playfair text-xl md:text-2xl leading-relaxed mt-4 text-white/90">"{t.quote}"</blockquote>
              <figcaption className="flex items-center gap-3 mt-6">
                <img src={t.img} alt={t.name} className="w-11 h-11 rounded-full object-cover border border-white/20" />
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-neutral-500">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pb-24">
        <div className="text-center mb-14">
          <Label className="text-fuchsia-400">Pricing</Label>
          <h2 className="font-playfair text-4xl sm:text-5xl mt-4">Simple, salon-friendly</h2>
          <p className="text-neutral-500 mt-4 max-w-xl mx-auto text-sm">No per-booking fees, no commissions on your sales. Pay once, use everything.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map(p => (
            <div key={p.key} data-testid={`plan-${p.key}`}
                 className={`rounded-3xl p-7 relative bg-white/[0.03] border transition-colors ${p.primary
                   ? "border-fuchsia-500/50 shadow-[0_0_40px_rgba(217,70,239,0.18)]"
                   : "border-white/10 hover:bg-white/[0.06]"}`}>
              {p.primary && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white text-[10px] uppercase tracking-widest font-bold">Best value</div>}
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-semibold">{p.title}</div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-bold font-playfair text-amber-200">{p.price}</span>
              </div>
              <div className="text-xs text-neutral-500 mt-1">{p.per}</div>
              <ul className="mt-6 space-y-2.5">
                {p.items.map(i => (
                  <li key={i} className="flex items-start gap-2 text-sm text-neutral-400">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> {i}
                  </li>
                ))}
              </ul>
              <Link to="/signup-salon" data-testid={`plan-cta-${p.key}`}
                    className={`mt-7 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5 ${p.primary
                      ? "bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-[0_10px_28px_-8px_rgba(217,70,239,0.6)]"
                      : "border border-white/15 text-white/85 hover:bg-white/5"}`}>
                {p.cta} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 pb-24">
        <div className="rounded-3xl p-10 sm:p-16 text-center relative overflow-hidden border border-amber-300/20"
             style={{ background: "linear-gradient(135deg, rgba(217,70,239,0.14) 0%, rgba(234,179,8,0.10) 100%)" }}>
          <Zap className="w-10 h-10 mx-auto text-amber-300" />
          <h2 className="font-playfair text-3xl sm:text-5xl mt-5">Ready to bring your salon online?</h2>
          <p className="text-neutral-400 mt-4 max-w-xl mx-auto">Set up in 90 seconds. Cancel anytime in your trial. Pay only when it works.</p>
          <Link to="/signup-salon" data-testid="landing-cta-footer"
                className="inline-flex items-center gap-2 mt-9 px-8 py-4 rounded-full bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white font-bold hover:-translate-y-1 transition-transform shadow-[0_16px_40px_-10px_rgba(217,70,239,0.65)]">
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer — massive typography */}
      <footer className="relative z-10 border-t border-white/10 pt-16 pb-10 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 sm:px-10">
          <div className="font-playfair text-[13vw] md:text-[10vw] leading-none text-white/[0.06] select-none whitespace-nowrap" aria-hidden="true">
            MIRACURL <span className="text-amber-300/20">✦</span>
          </div>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
            <div className="flex items-center gap-2"><Scissors className="w-3.5 h-3.5 text-fuchsia-400" /> © Miracurl Salon Suite · Marathahalli, Bangalore</div>
            <div className="flex items-center gap-5">
              <Link to="/login" className="hover:text-white transition-colors">Sign in</Link>
              <Link to="/signup-salon" className="hover:text-white transition-colors">Free trial</Link>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <Link to="/staff-registry" className="hover:text-white transition-colors">Verify staff (free)</Link>
            </div>
          </div>
        </div>
      </footer>
      <SalesChatWidget />
      <InstallAppPrompt variant="app" />
    </div>
  );
}

import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Calendar, Receipt, Star, Users, BarChart3, Shield, ArrowRight, Check, Sparkles, Zap, MessageSquare, Scissors, Gift } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import ChatButton from "@/components/ChatButton";
import InstallAppPrompt from "@/components/InstallAppPrompt";

const FEATURES = [
  { icon: Calendar, title: "Online Booking 24/7", desc: "Customers self-book in 5 taps. Shareable WhatsApp link.", color: "sky" },
  { icon: Receipt, title: "POS & Billing", desc: "Add Guest, multi-stylist invoices, GST, Paytm/Cash/Card.", color: "rose" },
  { icon: Star, title: "Reviews → ₹ Credits", desc: "4★+ reviews earn ₹50 credit. Lifts your Google rating.", color: "amber" },
  { icon: Users, title: "Customer CRM", desc: "Phone-first dedupe, referral codes, ₹100 reward each side.", color: "emerald" },
  { icon: BarChart3, title: "Reports + Commission", desc: "Daily, monthly revenue. Per-stylist commission tracked.", color: "violet" },
  { icon: Shield, title: "Multi-tenant Secure", desc: "Each salon's data is fully isolated. JWT + tenant context.", color: "indigo" },
];

const COLOR_MAP = {
  sky: { tile: "bg-sky-100", icon: "text-sky-600" },
  rose: { tile: "bg-rose-100", icon: "text-rose-600" },
  amber: { tile: "bg-amber-100", icon: "text-amber-600" },
  emerald: { tile: "bg-emerald-100", icon: "text-emerald-600" },
  violet: { tile: "bg-violet-100", icon: "text-violet-600" },
  indigo: { tile: "bg-indigo-100", icon: "text-indigo-600" },
};

const STEPS = [
  { n: 1, t: "Sign up free", d: "4-step wizard creates your salon page in 90 seconds. No credit card." },
  { n: 2, t: "Add staff & services", d: "Stock the menu — services, products, stylists, business hours." },
  { n: 3, t: "Share your link", d: "Post your /book URL on Instagram, WhatsApp & Google. Bookings flow in." },
];

const PLANS = [
  { key: "trial", title: "Free Trial", price: "₹0", per: "7 days", cta: "Start trial", primary: false,
    items: ["All features unlocked", "Up to 50 customers", "Email support", "Cancel anytime"] },
  { key: "half_year", title: "6-Month Plan", price: "₹10,000", per: "for 6 months", cta: "Get started", primary: true,
    items: ["Unlimited customers", "Unlimited bookings", "Per-stylist commission", "WhatsApp support", "All features"] },
  { key: "annual", title: "Annual Plan", price: "₹20,000", per: "for 1 year — save ₹0 effectively", cta: "Best value", primary: false,
    items: ["Everything in 6-Month", "12 months access", "Priority support", "Custom branding next year"] },
];

export default function Landing() {
  // Capture affiliate referral slug from `?ref=<slug>` and persist for the signup wizard
  const [refSlug, setRefSlug] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get("ref") || "").trim().toLowerCase();
    if (ref) {
      localStorage.setItem("miracurl_ref", ref);
      setRefSlug(ref);
    } else {
      const stored = localStorage.getItem("miracurl_ref");
      if (stored) setRefSlug(stored);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-800" data-testid="landing-page">
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed -right-32 -top-40 w-[620px] h-[620px] rounded-full opacity-50 z-0"
           style={{ background: "radial-gradient(circle at 30% 30%, #ec4899, #d946ef 40%, #6366f1 80%, transparent 100%)" }} />
      <div className="pointer-events-none fixed -left-40 top-[420px] w-[480px] h-[480px] rounded-full opacity-40 z-0"
           style={{ background: "radial-gradient(circle at 60% 40%, #818cf8, #a78bfa 40%, #ec4899 80%, transparent 100%)" }} />

      {/* Nav */}
      <header className="relative z-10 px-6 sm:px-10 pt-6 flex items-center justify-between">
        <BrandMark variant="light" size="md" />
        <div className="flex items-center gap-3 sm:gap-6 text-sm">
          <a href="#features" className="hidden sm:block text-slate-600 hover:text-slate-900">Features</a>
          <a href="#pricing" className="hidden sm:block text-slate-600 hover:text-slate-900">Pricing</a>
          <Link to="/login" className="text-slate-600 hover:text-slate-900 font-medium" data-testid="landing-login">Sign in</Link>
          <Link to="/signup-salon" data-testid="landing-cta-nav"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white text-xs sm:text-sm font-semibold hover:from-rose-600 hover:to-fuchsia-700 shadow-[0_8px_20px_-6px_rgba(244,63,94,0.55)] transition">
            Start free trial
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pt-16 sm:pt-24 pb-16 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-100 text-sky-600 text-[11px] uppercase tracking-[0.18em] font-semibold">
          <Sparkles className="w-3 h-3" /> 7-Day Free Trial · No credit card
        </span>
        <h1 className="font-playfair text-5xl sm:text-7xl tracking-tight text-slate-900 mt-6 leading-[1.05]">
          The salon software<br />that pays for itself.
        </h1>
        <p className="text-slate-600 text-lg mt-6 max-w-2xl mx-auto">
          Bookings, billing, customer rewards, and per-stylist commission tracking — in one beautiful suite,
          built for Indian salons. Replace your notebook in under 90 seconds.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
          <Link to="/signup-salon" data-testid="landing-cta-hero"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white font-semibold hover:from-rose-600 hover:to-fuchsia-700 shadow-[0_12px_28px_-8px_rgba(244,63,94,0.55)] transition text-base">
            Start your free trial <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/book/miracurl-marathahalli" data-testid="landing-demo-btn"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition">
            See a live booking page
          </Link>
        </div>
        <div className="mt-10 flex items-center justify-center gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Unlimited bookings</span>
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Multi-stylist invoices</span>
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp share built-in</span>
        </div>
        {refSlug && (
          <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-sm" data-testid="landing-ref-banner">
            <Gift className="w-4 h-4" /> Referred by <b className="mx-1">{refSlug}</b> — they'll earn ₹1,000 when you sign up.
          </div>
        )}
      </section>

      {/* Social proof / numbers */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pb-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{ v: "₹0", l: "Setup cost" }, { v: "90 sec", l: "To go live" }, { v: "5★", l: "Customer flow" }, { v: "24/7", l: "Bookings open" }].map(s => (
            <div key={s.l} className="bg-white/70 backdrop-blur rounded-xl border border-slate-200 px-4 py-4 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-slate-800">{s.v}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 py-16">
        <div className="text-center mb-12">
          <span className="text-xs uppercase tracking-[0.25em] text-sky-600 font-semibold">Everything you need</span>
          <h2 className="font-playfair text-3xl sm:text-5xl text-slate-900 mt-3">Built for how Indian salons actually work</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => {
            const c = COLOR_MAP[f.color] || COLOR_MAP.sky;
            const I = f.icon;
            return (
              <div key={f.title} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition" data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.tile}`}>
                  <I className={`w-6 h-6 ${c.icon}`} />
                </div>
                <h3 className="font-playfair text-xl text-slate-900 mt-4">{f.title}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-16">
        <div className="text-center mb-12">
          <span className="text-xs uppercase tracking-[0.25em] text-rose-500 font-semibold">How it works</span>
          <h2 className="font-playfair text-3xl sm:text-5xl text-slate-900 mt-3">Live in 3 steps</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative">
          {STEPS.map((s, idx) => (
            <div key={s.n} className="relative bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white flex items-center justify-center font-bold text-lg shadow-lg">{s.n}</div>
              <h3 className="font-playfair text-xl text-slate-900 mt-4">{s.t}</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{s.d}</p>
              {idx < STEPS.length - 1 && (
                <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 py-16">
        <div className="text-center mb-12">
          <span className="text-xs uppercase tracking-[0.25em] text-amber-600 font-semibold">Pricing</span>
          <h2 className="font-playfair text-3xl sm:text-5xl text-slate-900 mt-3">Simple, salon-friendly</h2>
          <p className="text-slate-600 mt-3 max-w-xl mx-auto text-sm">No per-booking fees, no commissions on your sales. Pay once, use everything.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map(p => (
            <div key={p.key} data-testid={`plan-${p.key}`}
                 className={`rounded-2xl border p-6 shadow-sm relative ${p.primary ? "bg-gradient-to-b from-sky-50/60 to-white border-sky-300 ring-2 ring-sky-200" : "bg-white border-slate-200"}`}>
              {p.primary && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white text-[10px] uppercase tracking-widest font-bold">Most popular</div>}
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">{p.title}</div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-bold text-slate-900">{p.price}</span>
                <span className="text-xs text-slate-500 mb-1.5">{p.per}</span>
              </div>
              <ul className="mt-5 space-y-2.5">
                {p.items.map(i => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /> {i}
                  </li>
                ))}
              </ul>
              <Link to="/signup-salon" data-testid={`plan-cta-${p.key}`}
                    className={`mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                      p.primary
                        ? "bg-gradient-to-r from-sky-500 to-blue-500 text-white hover:from-sky-600 hover:to-blue-600 shadow"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}>
                {p.cta} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 py-16">
        <div className="rounded-2xl p-10 sm:p-14 text-center text-white relative overflow-hidden"
             style={{ background: "linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #6366f1 100%)" }}>
          <Zap className="w-10 h-10 mx-auto opacity-90" />
          <h2 className="font-playfair text-3xl sm:text-5xl mt-4">Ready to bring your salon online?</h2>
          <p className="text-white/85 mt-3 max-w-xl mx-auto">Set up in 90 seconds. Cancel anytime in your trial. Pay only when it works.</p>
          <Link to="/signup-salon" data-testid="landing-cta-footer"
                className="inline-flex items-center gap-2 mt-8 px-7 py-3.5 rounded-xl bg-white text-rose-600 font-bold hover:bg-slate-50 transition shadow-lg">
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 py-10 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2"><Scissors className="w-3.5 h-3.5 text-rose-500" /> © Miracurl Salon Suite · Marathahalli, Bangalore</div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="hover:text-slate-700">Sign in</Link>
          <Link to="/signup-salon" className="hover:text-slate-700">Free trial</Link>
          <a href="#features" className="hover:text-slate-700">Features</a>
          <a href="#pricing" className="hover:text-slate-700">Pricing</a>
        </div>
      </footer>
      <ChatButton message="Hi Miracurl ✦ I'd like to know more about getting my salon on the platform." />
      <InstallAppPrompt variant="app" />
    </div>
  );
}

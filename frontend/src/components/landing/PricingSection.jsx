import { Link } from "react-router-dom";
import { ArrowRight, Check, Scissors, UtensilsCrossed, Crown } from "lucide-react";
import { signupHref } from "@/lib/region";
import { trackCta } from "@/lib/analytics";
import { buildPlans, buildIntlPlans, restoPlans, fmtUSD } from "./pricingData";

const TONE = {
  salon: { I: Scissors, img: "/landing/hero-salon.jpg", kicker: "Salon plans", title: "Salons, Spas & Barbershops", grad: "from-[#f472b6] to-[#E35A89]", ring: "ring-[#E35A89]/50", text: "text-[#E35A89]", soft: "bg-rose-50 text-rose-600" },
  restaurant: { I: UtensilsCrossed, img: "/landing/hero-restaurant.jpg", kicker: "Restaurant plans", title: "Restaurants & Cafés", grad: "from-[#fb923c] to-[#f43f5e]", ring: "ring-orange-400/50", text: "text-orange-600", soft: "bg-orange-50 text-orange-600" },
};

const Label = ({ children, className = "" }) => <span className={`text-xs uppercase tracking-[0.25em] font-outfit font-semibold ${className}`}>{children}</span>;

function PlanCard({ p, t, to, testid, region, children }) {
  return (
    <div data-testid={testid} className={`relative flex flex-col rounded-2xl p-5 border transition-[transform,box-shadow] hover:-translate-y-0.5 ${p.primary ? `bg-white border-transparent ring-2 ${t.ring} shadow-[0_24px_50px_-28px_rgba(184,134,59,0.6)]` : "bg-[#fdfaf4] border-[#efe3c8] hover:shadow-[0_18px_40px_-28px_rgba(184,134,59,0.5)]"}`}>
      {p.primary && <span className={`absolute -top-3 left-5 px-3 py-1 rounded-full bg-gradient-to-r ${t.grad} text-white text-[10px] uppercase tracking-widest font-bold shadow`}>{p.ribbon || "Best value"}</span>}
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">{p.title}</div>
      {p.tagline && <div className="text-xs text-slate-500 mt-1" data-testid={`plan-tagline-${p.key}`}>{p.tagline}</div>}
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-outfit text-3xl font-extrabold text-slate-900 tracking-tight">{p.priceText}</span>
        {p.unit && <span className="text-sm font-bold text-slate-500">{p.unit}</span>}
      </div>
      <div className="text-[11px] text-slate-500 mt-1 leading-snug">{p.per}</div>
      {children}
      <ul className="mt-4 space-y-2 flex-1">
        {(p.items || []).slice(0, 5).map(i => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700"><Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" /> {i}</li>
        ))}
      </ul>
      <Link to={to} onClick={() => trackCta(`plan-cta-${p.key}`, { region })} data-testid={`plan-cta-${p.key}`}
        className={`mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-transform hover:-translate-y-0.5 ${p.primary
          ? `bg-gradient-to-r ${t.grad} text-white shadow-[0_14px_30px_-12px_rgba(227,90,137,0.55)] hover:brightness-110`
          : "border border-[#e0c07a] text-slate-800 hover:bg-amber-50"}`}>
        {p.cta} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function Door({ v, from, children, testid }) {
  const t = TONE[v];
  return (
    <article data-testid={testid} className="rounded-[28px] bg-white border border-[#efe3c8] shadow-[0_30px_80px_-40px_rgba(184,134,59,0.45)] overflow-hidden">
      <div className="relative h-36 sm:h-40">
        <img src={t.img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover object-[left_30%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/15 to-transparent" />
        <div className="absolute top-4 left-4 flex items-center gap-2.5 rounded-2xl bg-white/95 backdrop-blur pl-1.5 pr-4 py-1.5 shadow-lg">
          <span className={`w-9 h-9 rounded-full bg-gradient-to-br ${t.grad} text-white flex items-center justify-center`}><t.I className="w-4 h-4" /></span>
          <span className="leading-tight"><span className="block text-[12px] font-extrabold uppercase tracking-wide text-slate-900">{t.kicker}</span><span className="block text-[11px] text-slate-500">{t.title}</span></span>
        </div>
        {from && (
          <div className="absolute bottom-4 right-4 rounded-2xl bg-white/95 backdrop-blur px-4 py-2 shadow-lg leading-none" data-testid={`${testid}-from`}>
            <div className="text-[10px] text-slate-500 font-medium">Starts from</div>
            <div className="mt-1 flex items-baseline gap-0.5"><span className="font-outfit text-2xl font-extrabold text-slate-900">{from}</span><span className="text-xs font-bold text-slate-600">/mo</span></div>
          </div>
        )}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </article>
  );
}

function Enterprise({ catalog }) {
  return (
    <div className="mt-5 rounded-2xl border border-[#e0c07a] bg-amber-50/70 p-5" data-testid="plan-intl-enterprise">
      <p className="text-[11px] uppercase tracking-[3px] text-[#a87e2f] font-semibold inline-flex items-center gap-1.5"><Crown className="w-3.5 h-3.5" /> Managing 5+ branches?</p>
      <h3 className="mt-1.5 text-lg font-semibold text-slate-900">Enterprise for Multi-Branch Chains</h3>
      <p className="text-sm text-slate-600 mt-1.5">Starting from <b className="text-[#a87e2f]">{fmtUSD(catalog?.intl_enterprise_monthly?.price ?? 399)}/month</b> — or custom annual contracts tailored to your chain.</p>
      <ul className="mt-3 grid sm:grid-cols-3 gap-2">
        {["Centralized bookings & billing", "AI marketing on autopilot", "Unlimited staff & branches"].map(f => (
          <li key={f} className="flex items-start gap-2 text-[12.5px] text-slate-600"><Check className="w-4 h-4 text-[#a87e2f] mt-0.5 flex-shrink-0" /> {f}</li>
        ))}
      </ul>
      <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-[#e9d9ae] bg-white pl-1.5 pr-4 py-1.5" data-testid="enterprise-consultant-chip">
        <span className="w-8 h-8 rounded-full bg-amber-100 text-[#a87e2f] flex items-center justify-center text-sm">👨‍💼</span>
        <span className="text-[12px] text-slate-600 leading-tight"><b className="text-slate-900">Bablu Kumar</b> · Enterprise Consultant<span className="block text-[10px] text-emerald-600">● Usually replies within 5 minutes</span></span>
      </div>
      <div className="flex flex-wrap gap-2.5 mt-4">
        <Link to="/demo" data-testid="enterprise-book-demo" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white bg-[#C89B52] hover:bg-[#b8863b] hover:-translate-y-0.5 transition-transform">📞 Book a Demo</Link>
        <a href={`https://wa.me/919180379552?text=${encodeURIComponent("Hi! I run a multi-branch salon chain and I'd like to know about Miracurl Enterprise plans.")}`} target="_blank" rel="noreferrer" data-testid="enterprise-whatsapp"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-slate-900 bg-[#25D366] hover:-translate-y-0.5 transition-transform">💬 Chat on WhatsApp</a>
        <button onClick={() => window.dispatchEvent(new Event("open-sales-chat"))} data-testid="enterprise-ask-mira"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold text-[#a87e2f] border border-[#C89B52]/60 hover:bg-amber-50 transition-colors">✦ Ask Mira — instant answers</button>
      </div>
    </div>
  );
}

export function PricingSection({ region, pickRegion, catalog, salonFrom, restoFrom }) {
  const us = region === "intl";
  const t = TONE.salon;
  const salonPlans = us
    ? buildIntlPlans(catalog).map(p => ({ ...p, priceText: fmtUSD(p.monthly), unit: p.annual ? "/mo" : "", per: p.annual ? "billed monthly" : p.per, cta: "Start free trial", ribbon: "Most popular" }))
    : buildPlans(catalog).map(p => ({ ...p, priceText: p.price, unit: "", ribbon: "Best value" }));
  const resto = restoPlans(catalog, us ? "USD" : "INR").map(p => ({
    key: p.key, title: p.label, priceText: p.price, unit: "", per: p.sub, primary: p.popular, ribbon: "Most popular", cta: "Start your free month",
    items: ["All features included", "Unlimited orders & tables", "Mira AI included", "First month free"],
  }));
  return (
    <section id="pricing" className="relative z-10 max-w-[1400px] mx-auto px-5 sm:px-8 py-16 sm:py-24" data-testid="pricing-section">
      <div className="text-center mb-12">
        <Label className="text-[#E35A89]">Pricing</Label>
        <h2 className="font-playfair text-4xl sm:text-5xl text-[#141a33] mt-4">Simple pricing — <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E35A89] to-[#f97316]">salons & restaurants</span></h2>
        <p className="text-slate-600 mt-4 max-w-xl mx-auto text-sm md:text-base">No per-booking fees, no commissions on your sales. Prices shown in your local currency — switch anytime.</p>
        <div className="inline-flex items-center gap-1 mt-7 p-1 rounded-full bg-white border border-[#e9d9ae] shadow-sm" data-testid="pricing-region-toggle">
          {[["in", "🇮🇳 India · ₹"], ["intl", "🌍 International · $"]].map(([k, l]) => (
            <button key={k} data-testid={`pricing-region-${k}`} onClick={() => pickRegion(k)}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition-colors ${region === k ? "bg-gradient-to-r from-[#F0D9A5] to-[#C89B52] text-[#1a1408] shadow" : "text-slate-600 hover:text-slate-900"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        <Door v="salon" from={salonFrom} testid="pricing-door-salon">
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            {salonPlans.map(p => (
              <PlanCard key={p.key} p={p} t={t} to={signupHref("salon", region)} testid={`plan-${p.key}`} region={region}>
                {us && p.annual && <div className="text-xs text-slate-500 mt-2" data-testid={`plan-annual-${p.key}`}>or <b className="text-slate-800">{fmtUSD(p.annual)}/yr</b>{p.monthly && p.monthly * 12 > p.annual && <span className="text-emerald-600"> — save {fmtUSD(p.monthly * 12 - p.annual)}</span>}</div>}
                {us && <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 font-medium" data-testid={`plan-trial-badge-${p.key}`}><Check className="w-3 h-3" /> 30-day free trial · no card</div>}
              </PlanCard>
            ))}
          </div>
          {us && <Enterprise catalog={catalog} />}
          <p className="text-[11px] text-slate-400 mt-4">{us ? "Prices in USD for clients outside India (US, UK, UAE, Canada, Australia & more). Billed via secure international payment link." : "Billed in INR, GST extra. Cancel anytime."}</p>
        </Door>

        <Door v="restaurant" from={restoFrom} testid="pricing-door-restaurant">
          {resto.length ? (
            <div data-testid="resto-pricing">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 mb-4">
                <h3 className="font-playfair text-xl text-slate-900">First month free — then pick what suits you</h3>
                <Link to={signupHref("restaurant", region)} onClick={() => trackCta("pricing-resto-cta", { region })} data-testid="resto-pricing-cta"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-bold bg-gradient-to-r from-amber-500 to-rose-500 hover:brightness-110 hover:-translate-y-0.5 transition-transform whitespace-nowrap">
                  Start your free month <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                {resto.map(p => <PlanCard key={p.key} p={p} t={TONE.restaurant} to={signupHref("restaurant", region)} testid={`resto-plan-${p.key}`} region={region} />)}
              </div>
              <p className="text-[11px] text-slate-400 mt-4">Annual = 10 × monthly — 2 months free. {us ? "Billed in USD." : "Billed in INR, GST extra."}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-6 text-center" data-testid="resto-pricing-empty">Restaurant plans for your region are coming soon — <Link to={signupHref("restaurant", region)} className="font-semibold text-[#8a6420]">start your free month</Link> meanwhile.</p>
          )}
        </Door>
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles, Scissors, UtensilsCrossed, CalendarClock } from "lucide-react";
import { track, trackCta } from "@/lib/analytics";

const pickVertical = (v) => {
  track("hero_vertical_pick", { vertical: v, region: "intl" });
  try { localStorage.setItem("miracurl_vertical_interest", v); } catch { /* private mode */ }
  if (typeof window.gtag === "function") window.gtag("set", "user_properties", { vertical_interest: v });
};

// US / International hero: the offer in one sentence, a salon-or-restaurant fork straight into the right
// signup page, and a demo path for owners who want to talk first.
export function UsHero({ trialDays, fromPrice, demoBookPath, heroImg }) {
  return (
    <section className="relative overflow-hidden" data-testid="us-hero">
      <img src={heroImg} alt="" aria-hidden="true" fetchPriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/75" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 20%, rgba(5,5,5,0.2) 0%, rgba(5,5,5,0.94) 80%)" }} />
      <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pt-16 sm:pt-24 pb-44 sm:pb-56 text-center animate-fade-up">
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-black/50 border border-white/15 backdrop-blur text-[#DFB78C] text-[11px] uppercase tracking-[0.2em] font-semibold" data-testid="us-hero-badge">
          <Sparkles className="w-3 h-3" /> {trialDays}-day free trial · No credit card · Cancel anytime
        </span>
        <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl tracking-tight font-light mt-8 leading-[1.08]" data-testid="us-hero-h1">
          Salon &amp; restaurant software that{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-b from-[#F5DFA8] via-[#DFB78C] to-[#B8863B]">books, bills and brings clients back.</span>
        </h1>
        <p className="text-white/70 text-base md:text-lg mt-6 max-w-2xl mx-auto font-light" data-testid="us-hero-sub">
          Online booking, card-or-cash POS, email &amp; WhatsApp reminders, staff payroll and <b className="text-[#EAD3B3] font-medium">Mira</b> — your 24/7 AI receptionist.
          {fromPrice ? <> Plans from <b className="text-[#EAD3B3] font-medium">${fromPrice}/mo</b> after your free trial.</> : null}
        </p>

        <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto mt-9" data-testid="us-vertical-picker">
          {[
            ["salon", Scissors, "I run a salon, spa or barbershop", "Appointments · stylists · retail · loyalty", "/signup-salon-us"],
            ["restaurant", UtensilsCrossed, "I run a restaurant or café", "Reservations · QR table orders · kitchen tickets", "/signup-restaurant-us"],
          ].map(([v, I, title, sub, to]) => (
            <Link key={v} to={to} onClick={() => pickVertical(v)} data-testid={`us-pick-${v}`}
              className="group text-left rounded-2xl border border-white/15 bg-black/40 backdrop-blur px-5 py-4 hover:border-[#DFB78C]/60 hover:bg-[#DFB78C]/10 hover:-translate-y-0.5 transition-[transform,background-color,border-color]">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#DFB78C] text-[#050505] flex items-center justify-center shrink-0"><I className="w-5 h-5" /></span>
                <div className="min-w-0">
                  <div className="font-semibold text-white text-sm sm:text-base leading-tight">{title}</div>
                  <div className="text-[11px] text-white/50 mt-0.5">{sub}</div>
                </div>
                <ArrowRight className="w-4 h-4 ml-auto text-[#DFB78C] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-[11px] text-[#DFB78C] font-semibold mt-3">Start free trial →</div>
            </Link>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6 text-sm">
          <Link to="/demo" onClick={() => track("demo_cta_click", { placement: "hero", region: "intl" })} data-testid="us-demo-cta"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[#DFB78C]/50 bg-black/30 backdrop-blur text-[#EAD3B3] font-semibold hover:bg-[#DFB78C]/15 transition-colors">
            <CalendarClock className="w-4 h-4" /> Book a 15-min demo
          </Link>
          <Link to={demoBookPath} onClick={() => trackCta("landing-demo-btn", { region: "intl" })} data-testid="landing-demo-btn"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white/70 hover:text-white transition-colors">
            See a live booking page <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/50">
          {["Unlimited bookings & staff", "0% booking commission", "Set up in 90 seconds"].map(t => (
            <span key={t} className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> {t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// Factual replacement for the India testimonials block — no invented quotes.
export function UsWhySwitch() {
  const rows = [
    ["0% commission", "You keep every dollar of every booking — we never take a cut of your sales."],
    ["One price, every feature", "Booking, POS, CRM, payroll, inventory and reports in one plan. No per-seat or per-location surprises."],
    ["Mira answers while you work", "A 24/7 AI receptionist that chats with clients, fills slots and replies to reviews."],
    ["Yours in 90 seconds", "Create your booking page, add staff and services, share your link — no onboarding calls required."],
  ];
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pb-24" data-testid="us-why-switch">
      <div className="text-[10px] tracking-[0.35em] uppercase text-[#DFB78C]">Why owners switch</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">
        {rows.map(([h, d]) => (
          <div key={h} className="rounded-3xl bg-[#0F0F10] border border-white/10 p-8 hover:border-[#DFB78C]/30 transition-colors">
            <h3 className="font-playfair text-2xl text-white">{h}</h3>
            <p className="text-white/60 text-sm mt-3 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// Phones: the two actions stay one thumb away at all times.
export function UsStickyCta() {
  return (
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2 bg-gradient-to-t from-black via-black/95 to-transparent" data-testid="us-sticky-cta">
      <div className="flex gap-2">
        <Link to="/signup-salon-us" onClick={() => trackCta("sticky-trial", { region: "intl" })} data-testid="us-sticky-trial"
          className="flex-1 text-center py-3 rounded-full bg-[#DFB78C] text-[#050505] font-bold text-sm shadow-[0_10px_30px_-10px_rgba(223,183,140,0.7)]">
          Start free trial
        </Link>
        <Link to="/demo" onClick={() => track("demo_cta_click", { placement: "sticky", region: "intl" })} data-testid="us-sticky-demo"
          className="flex-1 text-center py-3 rounded-full border border-white/25 bg-black/70 backdrop-blur text-white font-semibold text-sm">
          Book demo
        </Link>
      </div>
    </div>
  );
}

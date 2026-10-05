import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Check, Scissors, UtensilsCrossed, CalendarClock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import SalesChatWidget from "@/components/SalesChatWidget";
import { MiniMock } from "@/components/landing/MiniMocks";
import { SALON_TILES, RESTO_TILES, slugOf } from "@/components/landing/featureData";
import { currentRegion, signupHref, hasRegionChoice, resolveGeoRegion } from "@/lib/region";
import { trackCta } from "@/lib/analytics";

const GROUPS = (us) => [
  { v: "salon", I: Scissors, label: "Salon Suite", tone: "text-[#E35A89]", grad: "from-[#E35A89] to-[#f97316]", btn: "from-[#f472b6] to-[#E35A89]", h: ["Everything a salon needs to ", "run itself"], tiles: SALON_TILES(us), cta: "Start free trial" },
  { v: "restaurant", I: UtensilsCrossed, label: "Restaurant Suite", tone: "text-orange-500", grad: "from-[#f97316] to-[#E35A89]", btn: "from-amber-500 to-rose-500", h: ["From table QR to kitchen — ", "never miss a beat"], tiles: RESTO_TILES, cta: "Start your free month" },
];

function FeatureRow({ f, g, i, cur, us, region }) {
  const [I, title, blurb, mock, tone, bullets] = f;
  const id = slugOf(title);
  const flip = i % 2 === 1;
  return (
    <article id={id} data-testid={`feature-${g.v}-${id}`} className="scroll-mt-28 grid lg:grid-cols-2 gap-8 lg:gap-14 items-center py-10 sm:py-14 border-b border-[#efe3c8] last:border-0 target:[&>div>h3]:text-[#b8863b]">
      <div className={flip ? "lg:order-2" : ""}>
        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}><I className="w-6 h-6" /></span>
        <h3 className="font-playfair text-3xl sm:text-4xl text-[#141a33] mt-5 transition-colors">{title}</h3>
        <p className="text-slate-600 text-base md:text-lg mt-3 leading-relaxed">{blurb}</p>
        <ul className="mt-5 space-y-2.5">
          {bullets.map(b => <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700"><span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Check className="w-3 h-3" strokeWidth={3} /></span>{b}</li>)}
        </ul>
        <Link to={signupHref(g.v, region)} onClick={() => trackCta(`feature-cta-${id}`, { region })} data-testid={`feature-cta-${id}`}
          className={`mt-7 inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-bold bg-gradient-to-r ${g.btn} hover:brightness-110 hover:-translate-y-0.5 transition-transform`}>
          {g.cta} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className={`relative ${flip ? "lg:order-1" : ""}`}>
        <div className="rounded-[32px] bg-white border border-[#efe3c8] shadow-[0_30px_80px_-40px_rgba(184,134,59,0.5)] h-[260px] sm:h-[320px] flex items-center justify-center overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br ${g.grad} opacity-[0.06]`} />
          <div className="relative scale-[1.35] sm:scale-[1.6]" aria-hidden="true"><MiniMock kind={mock} cur={cur} us={us} /></div>
        </div>
      </div>
    </article>
  );
}

export default function Features() {
  const { hash } = useLocation();
  const [region, setRegion] = useState(currentRegion);
  const us = region === "intl";
  const cur = us ? "$" : "₹";
  useEffect(() => { if (!hasRegionChoice()) resolveGeoRegion().then(r => { if (r) setRegion(r); }); }, []);
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => clearTimeout(t);
  }, [hash]);
  const groups = GROUPS(us);
  return (
    <div className="relative min-h-screen bg-[#fdf9f4] text-slate-800 font-outfit overflow-x-clip" data-testid="features-page">
      <div className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-amber-200/60 via-rose-200/50 to-transparent blur-3xl" aria-hidden="true" />
      <div className="relative z-10">
        <SiteHeader variant="light" subtitle="Salon & Restaurant Management Software" signupTo={signupHref("salon", region)} signupLabel="Start free trial" />
        <header className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-6 text-center">
          <span className="text-[11px] tracking-[0.3em] uppercase font-bold text-[#a8813d]">Every feature, explained</span>
          <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl text-[#141a33] mt-4 leading-[1.05]" data-testid="features-h1">One suite. <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E35A89] to-[#f97316]">Every tool</span> your business needs.</h1>
          <p className="text-slate-600 text-base md:text-lg mt-5 max-w-2xl mx-auto">Pick your vertical below — each feature links straight from the home page so you can see exactly what you get.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-8" data-testid="features-jump-nav">
            {groups.flatMap(g => g.tiles.map(([, t]) => (
              <a key={t} href={`#${slugOf(t)}`} data-testid={`features-jump-${slugOf(t)}`} className={`px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-[#efe3c8] hover:border-[#C89B52] transition-colors ${g.v === "salon" ? "text-[#b03a63]" : "text-orange-700"}`}>{t}</a>
            )))}
          </div>
        </header>
        {groups.map(g => (
          <section key={g.v} id={`features-${g.v}`} className="max-w-[1200px] mx-auto px-5 sm:px-8 py-10" data-testid={`features-group-${g.v}`}>
            <div className={`inline-flex items-center gap-2 text-[11px] tracking-[0.3em] uppercase font-bold ${g.tone}`}><g.I className="w-4 h-4" /> {g.label}</div>
            <h2 className="font-playfair text-3xl sm:text-5xl text-[#141a33] mt-3">{g.h[0]}<span className={`text-transparent bg-clip-text bg-gradient-to-r ${g.grad}`}>{g.h[1]}</span></h2>
            <div className="mt-4">{g.tiles.map((f, i) => <FeatureRow key={f[1]} f={f} g={g} i={i} cur={cur} us={us} region={region} />)}</div>
          </section>
        ))}
        <section className="max-w-4xl mx-auto px-5 sm:px-8 py-16 text-center">
          <div className="rounded-3xl p-10 sm:p-14 border border-[#e0c07a]" style={{ background: "linear-gradient(135deg, rgba(227,90,137,0.10) 0%, rgba(200,155,82,0.14) 100%)" }}>
            <h2 className="font-playfair text-3xl sm:text-5xl text-[#141a33]">Ready to see it with your own data?</h2>
            <p className="text-slate-600 mt-4">Set up in 90 seconds. Free trial, no credit card.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link to={signupHref("salon", region)} data-testid="features-cta-salon" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-gradient-to-r from-[#f472b6] to-[#E35A89] text-white font-bold hover:brightness-110 hover:-translate-y-0.5 transition-transform">Salon free trial <ArrowRight className="w-4 h-4" /></Link>
              <Link to={signupHref("restaurant", region)} data-testid="features-cta-restaurant" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold hover:brightness-110 hover:-translate-y-0.5 transition-transform">Restaurant free month <ArrowRight className="w-4 h-4" /></Link>
              <Link to="/demo" data-testid="features-cta-demo" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border-2 border-[#e0c07a] text-[#8a6420] font-semibold hover:bg-amber-50 transition-colors"><CalendarClock className="w-4 h-4" /> Book a 15-min demo</Link>
            </div>
            <Link to="/" className="inline-block mt-6 text-sm text-[#8a6420] hover:text-[#C89B52]">← Back to home</Link>
          </div>
        </section>
      </div>
      <SalesChatWidget />
    </div>
  );
}

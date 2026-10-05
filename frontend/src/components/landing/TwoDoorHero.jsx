import { Link } from "react-router-dom";
import { ArrowRight, Scissors, UtensilsCrossed, Bell, Check, Star, ShieldCheck, Globe2, Heart, CalendarDays, Users, Hourglass, TrendingUp, CalendarCheck, Package, Megaphone, Receipt, CalendarClock, BadgeCheck, HeartHandshake, BarChart3, Sparkles, LayoutGrid, ShoppingBag, Boxes } from "lucide-react";
import { track, trackCta } from "@/lib/analytics";
import { signupHref } from "@/lib/region";
import { PhoneMock, TabletMock } from "./MiniMocks";

const pick = (vertical, region) => {
  track("hero_vertical_pick", { vertical, region });
  try { localStorage.setItem("miracurl_vertical_interest", vertical); } catch { /* private mode */ }
  if (typeof window.gtag === "function") window.gtag("set", "user_properties", { vertical_interest: vertical });
};

const BENEFITS = [
  [CalendarDays, "More\nBookings", "from-violet-400 to-indigo-500"],
  [Users, "Improve\nCustomer Loyalty", "from-rose-400 to-pink-500"],
  [Hourglass, "Save Time\n& Reduce Work", "from-emerald-400 to-teal-500"],
  [TrendingUp, "Grow\nYour Business", "from-amber-400 to-orange-500"],
];

const SALON_FEATURES = [[CalendarCheck, "Online Booking"], [Package, "Inventory"], [Megaphone, "Marketing Studio"], [Receipt, "POS & Billing"], [CalendarClock, "Staff Scheduling"], [BadgeCheck, "Staff Verification"], [HeartHandshake, "CRM & Loyalty"], [BarChart3, "Business Reports"], [Sparkles, "Mira AI Receptionist"]];
const RESTO_FEATURES = [[LayoutGrid, "Table & Order Management"], [ShoppingBag, "Online Ordering"], [BarChart3, "Business Reports"], [Receipt, "POS & Billing"], [Boxes, "Inventory Management"], [Megaphone, "Marketing Studio"], [HeartHandshake, "CRM & Customer Loyalty"], [CalendarClock, "Staff Scheduling"], [Sparkles, "Mira AI Receptionist"]];

function DoorCard({ d, region, cur }) {
  return (
    <article data-testid={d.testid}
      className="group relative flex flex-col rounded-[28px] bg-white border border-[#efe3c8] shadow-[0_30px_80px_-40px_rgba(184,134,59,0.45)] overflow-hidden hover:-translate-y-1 hover:shadow-[0_40px_90px_-40px_rgba(184,134,59,0.6)] transition-[transform,box-shadow] duration-300">
      <div className="relative h-60 sm:h-72 overflow-hidden">
        <img src={d.img} alt={d.title} loading={d.v === "salon" ? "eager" : "lazy"} fetchPriority={d.v === "salon" ? "high" : "auto"} decoding="async"
          className="w-full h-full object-cover object-left group-hover:scale-[1.03] transition-transform duration-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/5" />
        <div className="absolute top-4 left-4 flex items-center gap-2.5 rounded-2xl bg-white/95 backdrop-blur pl-1.5 pr-4 py-1.5 shadow-lg" data-testid={`${d.testid}-badge`}>
          <span className={`w-9 h-9 rounded-full bg-gradient-to-br ${d.tone} text-white flex items-center justify-center shrink-0`}><d.I className="w-4 h-4" /></span>
          <span className="leading-tight"><span className="block text-[12px] font-extrabold tracking-wide text-slate-900 uppercase">{d.kicker}</span><span className="block text-[11px] text-slate-500">{d.title}</span></span>
        </div>
        <div className="absolute right-3 -bottom-2 drop-shadow-2xl group-hover:-translate-y-1.5 transition-transform duration-500" aria-hidden="true">
          {d.v === "salon" ? <PhoneMock cur={cur} /> : <TabletMock cur={cur} />}
        </div>
        <div className="absolute bottom-4 left-4 flex items-center gap-2.5 rounded-2xl bg-white/95 backdrop-blur pl-1.5 pr-3 py-1.5 shadow-lg max-w-[60%]" data-testid={`${d.testid}-live-chip`}>
          <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Bell className="w-4 h-4" /></span>
          <span className="min-w-0 leading-tight"><span className="block text-[12px] font-bold text-slate-900 truncate">{d.live[0]}</span><span className="block text-[10.5px] text-slate-500 truncate">{d.live[1]}</span></span>
          <span className="ml-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" strokeWidth={3} /></span>
        </div>
      </div>
      <div className="p-5 sm:p-6 flex flex-col flex-1">
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5" data-testid={`${d.testid}-features`}>
          {d.features.map(([I, t]) => (
            <li key={t} className="flex items-center gap-2 text-[11.5px] font-medium text-slate-700 leading-tight min-w-0">
              <span className={`w-6 h-6 rounded-md ${d.chipTone} flex items-center justify-center shrink-0`}><I className="w-3.5 h-3.5" /></span><span>{t}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-5 border-t border-[#f3ead8] flex items-end justify-between gap-4">
          <div className="leading-none">
            <div className="text-[12px] text-slate-500 font-medium">Starts from</div>
            <div className="mt-1.5 flex items-baseline gap-0.5"><span className="font-outfit text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight" data-testid={`${d.testid}-price`}>{d.from || "—"}</span><span className="text-sm font-bold text-slate-600">/mo</span></div>
          </div>
          <Link to={d.to} onClick={() => { pick(d.v, region); trackCta(`door-cta-${d.v}`, { region }); }} data-testid={`${d.testid}-cta`}
            className={`inline-flex items-center gap-2 px-6 sm:px-7 py-3.5 rounded-full bg-gradient-to-r ${d.tone} text-white font-bold text-sm sm:text-base shadow-[0_16px_34px_-12px_rgba(227,90,137,0.55)] hover:brightness-110 hover:-translate-y-0.5 transition-transform whitespace-nowrap`}>
            {d.cta} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

// The hero is two doors: owners pick Salon or Restaurant and land on the right signup page in one click.
export function TwoDoorHero({ region, trialDays, salonFrom, restoFrom, stats }) {
  const us = region === "intl";
  const cur = us ? "$" : "₹";
  const doors = [
    { v: "salon", I: Scissors, kicker: "Salon Management", title: "Salons, Spas & Barbershops", img: "/landing/hero-salon.jpg", tone: "from-[#f472b6] to-[#E35A89]", chipTone: "bg-rose-100 text-rose-600",
      features: SALON_FEATURES, from: salonFrom, cta: "Explore Salon Plan", to: signupHref("salon", region), live: ["New Booking", "Hair Cut · 10:00 AM"], testid: "door-salon" },
    { v: "restaurant", I: UtensilsCrossed, kicker: "Restaurant Management", title: "Restaurants & Cafés", img: "/landing/hero-restaurant.jpg", tone: "from-[#fb923c] to-[#f43f5e]", chipTone: "bg-orange-100 text-orange-600",
      features: RESTO_FEATURES, from: restoFrom, cta: "Explore Restaurant Plan", to: signupHref("restaurant", region), live: ["New Order", "2× Chicken Biryani"], testid: "door-restaurant" },
  ];
  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k+` : `${n}`;
  const trust = [
    [Star, "All-in-One Solution", "text-amber-500 fill-amber-500"],
    [ShieldCheck, stats?.salons ? `Trusted by ${fmt(stats.salons)} Businesses` : "Trusted by Salon & Restaurant Owners", "text-[#b8863b]"],
    [Globe2, stats?.cities >= 3 ? `Used in ${fmt(stats.cities)} Cities · India & US` : "Serving India & US", "text-[#b8863b]"],
    [Heart, "Loved by Salon & Restaurant Owners", "text-rose-500 fill-rose-500"],
  ];
  return (
    <header className="max-w-[1400px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-8 relative" data-testid="two-door-hero">
      <div className="grid lg:grid-cols-12 gap-8 lg:gap-6 items-center">
        <div className="lg:col-span-4 lg:pr-2 min-w-0">
          <span className="inline-flex items-center gap-2 max-w-full px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#fff1d6] to-[#fde7e4] border border-[#f1dcae] text-[10px] tracking-[0.14em] uppercase font-bold text-[#7a5a1e] leading-snug sm:whitespace-nowrap" data-testid="hero-badge">
            <span className="text-[#E35A89]">✦</span> {trialDays}-day free trial · No credit card · Cancel anytime
          </span>
          <h1 className="font-playfair text-4xl sm:text-5xl lg:text-[2.9rem] xl:text-[3.5rem] leading-[1.04] mt-5 text-[#141a33]" data-testid="hero-h1">
            One Suite.<br />Two Businesses.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E35A89] via-[#f0567a] to-[#f97316]">Salon or Restaurant<br />— Pick Yours.</span>
          </h1>
          <p className="text-slate-600 text-base md:text-lg mt-5 leading-relaxed" data-testid="hero-sub">
            Booking, POS, CRM, staff payroll and Mira — your 24/7 AI receptionist — built separately for salons and for restaurants.
          </p>
          <div className="grid grid-cols-4 gap-2 sm:gap-3 mt-8" data-testid="hero-benefits">
            {BENEFITS.map(([I, t, g]) => (
              <div key={t} className="text-center">
                <span className={`mx-auto w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br ${g} text-white flex items-center justify-center shadow-[0_12px_24px_-10px_rgba(0,0,0,0.35)]`}><I className="w-5 h-5 sm:w-6 sm:h-6" /></span>
                <div className="mt-2.5 text-[11px] sm:text-[12.5px] font-bold text-slate-800 leading-tight whitespace-pre-line">{t}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-8 grid md:grid-cols-2 gap-5 sm:gap-6" data-testid="hero-doors">
          {doors.map(d => <DoorCard key={d.v} d={d} region={region} cur={cur} />)}
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-[#efe3c8] flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-semibold text-slate-700" data-testid="hero-trust-row">
        {trust.map(([I, t, c]) => <span key={t} className="inline-flex items-center gap-2"><I className={`w-4.5 h-4.5 w-[18px] h-[18px] ${c}`} /> {t}</span>)}
        <Link to="/demo" onClick={() => track("demo_cta_click", { placement: "hero", region })} data-testid="hero-demo-cta" className="inline-flex items-center gap-1.5 text-[#8a6420] hover:text-[#C89B52]">
          <CalendarClock className="w-4 h-4" /> Book a 15-min demo
        </Link>
      </div>
    </header>
  );
}

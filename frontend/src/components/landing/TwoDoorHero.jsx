import { Link } from "react-router-dom";
import { Check, ArrowRight, Scissors, UtensilsCrossed, Bell, CalendarCheck, QrCode, ChefHat, Receipt, Sparkles, Calendar, MessageSquare, Star, Users, Package, BarChart3, CalendarClock } from "lucide-react";
import { track, trackCta } from "@/lib/analytics";
import { signupHref } from "@/lib/region";

const SALON_IMG = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/98878cd0ea553bd4df7cc6ca3c05eaea3bd83533c44c0b7b2785932491d9d440.jpeg";
const RESTO_IMG = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/ad3e4226d2d8cc2e72aaed1a5d03aec5a372f32668c561f2ec3f11a02fb237c7.jpeg";

const pick = (vertical, region) => {
  track("hero_vertical_pick", { vertical, region });
  try { localStorage.setItem("miracurl_vertical_interest", vertical); } catch { /* private mode */ }
  if (typeof window.gtag === "function") window.gtag("set", "user_properties", { vertical_interest: vertical });
};

// The hero is two doors: owners pick Salon or Restaurant and land on the right signup page in one click.
export function TwoDoorHero({ region, trialDays, fromPrice }) {
  const us = region === "intl";
  const cur = us ? "$" : "₹";
  const doors = [
    { v: "salon", I: Scissors, title: "Salons, Spas & Barbershops", img: SALON_IMG, tone: "from-[#C89B52] to-[#E35A89]", chipTone: "bg-rose-50 text-rose-700 border-rose-200",
      bullets: ["24/7 online booking with stylist-level slots", us ? "Card or cash POS with your local sales tax" : "GST billing, thermal receipts & review QR", "Staff payroll, commissions & attendance"],
      cta: "Start free trial", to: signupHref("salon", region), more: ["See salon features ↓", "#salon"],
      live: ["Priya booked a haircut", "Tomorrow · 4:30 pm · Aisha", `${cur}${us ? "45" : "650"}`], testid: "door-salon" },
    { v: "restaurant", I: UtensilsCrossed, title: "Restaurants & Cafés", img: RESTO_IMG, tone: "from-amber-500 to-rose-500", chipTone: "bg-amber-50 text-amber-800 border-amber-200",
      bullets: ["QR table ordering straight to the kitchen", "Live kitchen tickets & one-tap table billing", "Reservations, waiter call & WhatsApp offers"],
      cta: "Start your free month", to: signupHref("restaurant", region), more: ["Explore restaurant suite →", "/restaurant"],
      live: ["Table 3 has an order", `2× Chicken Biryani · 1× Paneer Tikka — ${cur}${us ? "38" : "987"}`, ""], testid: "door-restaurant" },
  ];
  return (
    <header className="max-w-7xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-10 relative" data-testid="two-door-hero">
      <div className="text-center max-w-3xl mx-auto">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-100 to-rose-100 border border-amber-200 text-[10px] tracking-[0.25em] uppercase font-bold text-[#8a6420]" data-testid="hero-badge">
          <Sparkles className="w-3.5 h-3.5" /> {trialDays}-day free trial · No credit card · Cancel anytime
        </span>
        <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl leading-[1.08] mt-5 text-slate-900" data-testid="hero-h1">
          One suite. Two businesses.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#b8863b] via-[#E35A89] to-[#f97316]">Salon or restaurant — pick yours.</span>
        </h1>
        <p className="text-slate-500 text-base md:text-lg mt-5" data-testid="hero-sub">
          Booking, POS, CRM, staff payroll and Mira — your 24/7 AI receptionist — built separately for salons and for restaurants.
          {fromPrice ? <> Plans from <b className="text-slate-800">{fromPrice}</b> after your free trial.</> : null}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5 sm:gap-7 mt-10" data-testid="hero-doors">
        {doors.map(d => (
          <article key={d.v} data-testid={d.testid}
            className="group relative rounded-[28px] bg-white border border-[#e9d9ae] shadow-[0_30px_80px_-40px_rgba(184,134,59,0.45)] overflow-hidden hover:-translate-y-1 hover:shadow-[0_40px_90px_-40px_rgba(184,134,59,0.6)] transition-[transform,box-shadow] duration-300">
            <div className="relative h-52 sm:h-60 overflow-hidden">
              <img src={d.img} alt="" loading={d.v === "salon" ? "eager" : "lazy"} fetchPriority={d.v === "salon" ? "high" : "auto"} decoding="async"
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <span className={`absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur text-[11px] font-bold text-slate-800 border border-white`}>
                <d.I className="w-3.5 h-3.5" /> {d.title}
              </span>
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-2xl bg-white/95 backdrop-blur px-3.5 py-2.5 shadow-lg" data-testid={`${d.testid}-live-chip`}>
                <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Bell className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800 leading-tight truncate">{d.live[0]}</div>
                  <div className="text-[11px] text-slate-500 truncate">{d.live[1]}{d.live[2] ? ` — ${d.live[2]}` : ""}</div>
                </div>
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
            </div>
            <div className="p-6 sm:p-7">
              <h2 className="font-playfair text-2xl sm:text-3xl text-slate-900">{d.v === "salon" ? "For salons" : "For restaurants"}</h2>
              <ul className="mt-4 space-y-2">
                {d.bullets.map(b => (
                  <li key={b} className="flex items-start gap-2 text-sm text-slate-600"><Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> {b}</li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <Link to={d.to} onClick={() => { pick(d.v, region); trackCta(`door-cta-${d.v}`, { region }); }} data-testid={`${d.testid}-cta`}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r ${d.tone} text-white font-bold text-sm shadow-[0_14px_30px_-12px_rgba(227,90,137,0.6)] hover:brightness-110 hover:-translate-y-0.5 transition-transform`}>
                  {d.cta} <ArrowRight className="w-4 h-4" />
                </Link>
                {d.more[1].startsWith("#") ? (
                  <a href={d.more[1]} onClick={(e) => { e.preventDefault(); document.getElementById(d.more[1].slice(1))?.scrollIntoView({ behavior: "smooth" }); }} data-testid={`${d.testid}-more`}
                    className="text-sm font-semibold text-[#8a6420] hover:text-[#C89B52] transition-colors">{d.more[0]}</a>
                ) : (
                  <Link to={d.more[1]} data-testid={`${d.testid}-more`} className="text-sm font-semibold text-[#8a6420] hover:text-[#C89B52] transition-colors">{d.more[0]}</Link>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-xs text-slate-500">
        {["Unlimited bookings & staff", "0% booking commission", "Set up in 90 seconds"].map(t => (
          <span key={t} className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> {t}</span>
        ))}
        <Link to="/demo" onClick={() => track("demo_cta_click", { placement: "hero", region })} data-testid="hero-demo-cta" className="inline-flex items-center gap-1.5 font-semibold text-[#8a6420] hover:text-[#C89B52]">
          <CalendarClock className="w-3.5 h-3.5" /> Book a 15-min demo
        </Link>
      </div>
    </header>
  );
}

const SALON_TILES = (us) => [
  [Calendar, "Online Booking 24/7", "Clients self-book in 5 taps — stylist-level slots, zero double-booking."],
  [MessageSquare, us ? "Email & WhatsApp Reminders" : "WhatsApp Confirmations", "Confirmations, reminders & review requests on autopilot."],
  [Receipt, "POS Billing & CRM", us ? "Card or cash checkout, local sales tax, tips, full visit history." : "Multi-tab billing, GST invoices, discounts, full visit history."],
  [Users, "Staff, Payroll & Attendance", us ? "Clock-in, commissions, tips and downloadable pay stubs." : "Check-in/out, commissions, salary slips & leave."],
  [Star, us ? "Reviews → $ Credits" : "Reviews → ₹ Credits", us ? "4★+ reviews earn a $5 credit — lifts your Google rating." : "4★+ reviews earn ₹50 credit — lifts your Google rating."],
  [Package, "Inventory & Vendors", "Low-stock alerts with one-click vendor restock emails."],
  [BarChart3, "Reports & Commission", "Daily & monthly revenue, per-stylist performance emailed weekly."],
  [Sparkles, "Mira AI Receptionist", "Answers calls & chats 24/7 and books appointments for you."],
];

const RESTO_TILES = [
  [QrCode, "QR Table Ordering", "Diners scan, browse and order straight to the kitchen — no app, no waiter needed."],
  [ChefHat, "Live Kitchen Tickets", "Every order lands with a chime; Live Tables shows each table's running total."],
  [Receipt, "Table Billing", "All of a table's orders merge into one bill — one tap to close and reset."],
  [CalendarCheck, "Reservations", "Guests reserve online with party size and seating choice, pre-pick dishes."],
  [Bell, "Waiter Call & Live Status", "'Call waiter' / 'Water please' plus Order received → Cooking → Served on their phone."],
  [Sparkles, "Mira — AI Menu Studio", "AI paints appetizing dish photos and writes menu descriptions in one batch."],
];

export function VerticalSection({ id, vertical, region, demoPath }) {
  const salon = vertical === "salon";
  const tiles = salon ? SALON_TILES(region === "intl") : RESTO_TILES;
  return (
    <section id={id} className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-20" data-testid={`section-${vertical}`}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div className="max-w-2xl">
          <div className={`text-[10px] tracking-[0.35em] uppercase font-bold ${salon ? "text-[#E35A89]" : "text-amber-600"}`}>{salon ? "💇 Salon Suite" : "🍽️ Restaurant Suite"}</div>
          <h2 className="font-playfair text-3xl sm:text-5xl text-slate-900 mt-3">
            {salon ? <>Everything a salon needs to <em className="not-italic text-[#b8863b]">run itself</em></> : <>From table QR to kitchen — <em className="not-italic text-amber-600">never miss a beat</em></>}
          </h2>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <Link to={signupHref(vertical, region)} onClick={() => trackCta(`section-cta-${vertical}`, { region })} data-testid={`section-${vertical}-cta`}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-bold bg-gradient-to-r ${salon ? "from-[#C89B52] to-[#E35A89]" : "from-amber-500 to-rose-500"} hover:brightness-110 hover:-translate-y-0.5 transition-transform`}>
            {salon ? "Start free trial" : "Start your free month"} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to={demoPath} data-testid={`section-${vertical}-demo`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#e0c07a] text-[#8a6420] text-sm font-semibold hover:bg-amber-50 transition-colors">
            {salon ? "See a live booking page" : "Explore the restaurant suite"}
          </Link>
        </div>
      </div>
      <div className={`grid sm:grid-cols-2 gap-4 ${salon ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {tiles.map(([I, t, d]) => (
          <div key={t} className="rounded-3xl bg-white border border-[#e9d9ae] p-6 hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(184,134,59,0.5)] transition-[transform,box-shadow]" data-testid={`tile-${vertical}-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${salon ? "bg-rose-50 text-[#E35A89]" : "bg-amber-50 text-amber-600"}`}><I className="w-5 h-5" /></span>
            <h3 className="font-semibold text-slate-900 mt-4">{t}</h3>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

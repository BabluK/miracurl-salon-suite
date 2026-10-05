import { Link } from "react-router-dom";
import { ArrowRight, Play, CheckCircle2, Bell, Check, Scissors, UtensilsCrossed, Calendar, MessageSquare, Receipt, Users, Star, Package, BarChart3, Sparkles, QrCode, ChefHat, CalendarCheck, Smile, TrendingUp } from "lucide-react";
import { trackCta } from "@/lib/analytics";
import { signupHref } from "@/lib/region";
import { MiniMock, PhoneMock, TabletMock } from "./MiniMocks";

const SALON_TILES = (us) => [
  [Calendar, "Online Booking 24/7", "Clients self-book in 5 taps — stylist-level slots, zero double-booking.", "phone", "bg-rose-100 text-rose-500"],
  [MessageSquare, us ? "Email & WhatsApp Reminders" : "WhatsApp Confirmations", "Confirmations, reminders & review requests on autopilot.", "wa", "bg-emerald-100 text-emerald-600"],
  [Receipt, "POS Billing & CRM", us ? "Card or cash checkout, local sales tax, tips, full visit history." : "Multi-tab billing, GST invoices, discounts, full visit history.", "pos", "bg-violet-100 text-violet-600"],
  [Users, "Staff, Payroll & Attendance", us ? "Clock-in, commissions, tips and downloadable pay stubs." : "Check-in/out, commissions, salary slips & leave.", "staff", "bg-orange-100 text-orange-500"],
  [Star, us ? "Reviews → $ Credits" : "Reviews → ₹ Credits", us ? "4★+ reviews earn a $5 credit — lifts your Google rating." : "4★+ reviews earn ₹50 credit — lifts your Google rating.", "review", "bg-amber-100 text-amber-500"],
  [Package, "Inventory & Vendors", "Low-stock alerts with one-click vendor restock emails.", "inventory", "bg-sky-100 text-sky-600"],
  [BarChart3, "Reports & Commission", "Daily & monthly revenue, per-stylist performance emailed weekly.", "chart", "bg-pink-100 text-pink-500"],
  [Sparkles, "Mira AI Receptionist", "Answers calls & chats 24/7 and books appointments for you.", "mira", "bg-violet-100 text-violet-500"],
];

const RESTO_TILES = [
  [QrCode, "QR Table Ordering", "Diners scan, browse and order straight to the kitchen — no app, no waiter needed.", "qr", "bg-orange-100 text-orange-500"],
  [ChefHat, "Live Kitchen Tickets", "Every order lands with a chime; Live Tables shows each table's running total.", "kot", "bg-amber-100 text-amber-600"],
  [Receipt, "Table Billing", "All of a table's orders merge into one bill — one tap to close and reset.", "bill", "bg-emerald-100 text-emerald-600"],
  [CalendarCheck, "Reservations", "Guests reserve online with party size and seating choice, pre-pick dishes.", "reserve", "bg-rose-100 text-rose-500"],
  [Bell, "Waiter Call & Live Status", "'Call waiter' / 'Water please' plus Order received → Cooking → Served on their phone.", "waiter", "bg-sky-100 text-sky-600"],
  [Sparkles, "Mira — AI Menu Studio", "AI paints appetizing dish photos and writes menu descriptions in one batch.", "menu", "bg-violet-100 text-violet-500"],
];

const COPY = {
  salon: { I: Scissors, label: "Salon Suite", labelTone: "text-[#E35A89]", grad: "from-[#E35A89] to-[#f97316]", btn: "from-[#f472b6] to-[#E35A89]",
    h2: ["Everything a salon needs", "to ", "run itself"], sub: "Save time, get more bookings, keep clients happy and grow your business with an all-in-one salon management software.",
    cta: "Start free trial", demo: "See a live booking page", img: "/landing/salon-suite.jpg",
    live: ["New Booking", "Hair Cut · 10:00 AM"], badges: [[TrendingUp, "More\nBookings", "from-[#f472b6] to-[#E35A89]"], [Smile, "Happy\nClients", "from-[#fde68a] to-[#f59e0b]"]] },
  restaurant: { I: UtensilsCrossed, label: "Restaurant Suite", labelTone: "text-orange-500", grad: "from-[#f97316] to-[#E35A89]", btn: "from-amber-500 to-rose-500",
    h2: ["From table QR to kitchen —", "", "never miss a beat"], sub: "Take orders from the table, fire them to the kitchen instantly, bill in one tap and keep diners coming back — with Mira handling the busywork.",
    cta: "Start your free month", demo: "Explore the restaurant suite", img: "/landing/restaurant-suite.jpg",
    live: ["New Order", "Table 3 · 2× Chicken Biryani"], badges: [[TrendingUp, "Faster\nTables", "from-[#fb923c] to-[#f43f5e]"], [Smile, "Happy\nDiners", "from-[#fde68a] to-[#f59e0b]"]] },
};

function SuiteShowcase({ c, salon, cur, vertical }) {
  return (
    <div className="relative mt-4 lg:mt-0" data-testid={`section-${vertical}-showcase`}>
      <div className="relative rounded-[32px] overflow-hidden h-[300px] sm:h-[400px] lg:h-[440px] shadow-[0_40px_90px_-40px_rgba(184,134,59,0.55)] border border-[#efe3c8]">
        <img src={c.img} alt={c.label} loading="lazy" decoding="async" className="w-full h-full object-cover object-left" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#fdf9f4]/40" />
      </div>
      <div className="absolute left-4 sm:left-6 bottom-8 sm:bottom-12 flex items-center gap-2.5 rounded-2xl bg-white/95 backdrop-blur pl-1.5 pr-3.5 py-1.5 shadow-xl max-w-[52%] sm:max-w-none" data-testid={`section-${vertical}-live-chip`}>
        <span className="relative w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Bell className="w-4 h-4" /><span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#E35A89] border-2 border-white" /></span>
        <span className="min-w-0 leading-tight"><span className="block text-[13px] font-bold text-slate-900 truncate">{c.live[0]}</span><span className="block text-[11px] text-slate-500 truncate">{c.live[1]}</span></span>
        <span className="ml-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>
      </div>
      <div className="absolute right-6 sm:right-10 bottom-[-14px] sm:bottom-[-18px] drop-shadow-2xl scale-110 sm:scale-125 origin-bottom-right" aria-hidden="true">
        {salon ? <PhoneMock cur={cur} /> : <TabletMock cur={cur} />}
      </div>
      {c.badges.map(([I, t, g], i) => (
        <div key={t} className={`absolute ${i === 0 ? "-top-4 right-4 sm:-right-4" : "top-[46%] -right-2 sm:-right-6"} flex items-center gap-2 rounded-2xl bg-gradient-to-br ${g} ${i === 0 ? "text-white" : "text-[#5b3e05]"} px-3.5 py-2.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)]`}>
          <I className="w-5 h-5" /><span className="text-[12px] font-extrabold leading-tight whitespace-pre-line">{t}</span>
        </div>
      ))}
    </div>
  );
}

export function VerticalSection({ id, vertical, region, demoPath }) {
  const salon = vertical === "salon";
  const us = region === "intl";
  const cur = us ? "$" : "₹";
  const c = COPY[vertical];
  const tiles = salon ? SALON_TILES(us) : RESTO_TILES;
  return (
    <section id={id} className="relative z-10 max-w-[1400px] mx-auto px-5 sm:px-8 py-16 sm:py-24" data-testid={`section-${vertical}`}>
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <div>
          <div className={`inline-flex items-center gap-2 text-[11px] tracking-[0.3em] uppercase font-bold ${c.labelTone}`}><c.I className="w-4 h-4" /> {c.label}</div>
          <h2 className="font-playfair text-4xl sm:text-5xl lg:text-[3.6rem] leading-[1.05] text-[#141a33] mt-4">
            {c.h2[0]}<br />{c.h2[1]}<span className={`text-transparent bg-clip-text bg-gradient-to-r ${c.grad}`}>{c.h2[2]}</span>
          </h2>
          <p className="text-slate-600 text-base md:text-lg mt-5 leading-relaxed max-w-xl">{c.sub}</p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link to={signupHref(vertical, region)} onClick={() => trackCta(`section-cta-${vertical}`, { region })} data-testid={`section-${vertical}-cta`}
              className={`inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-white text-base font-bold bg-gradient-to-r ${c.btn} shadow-[0_16px_34px_-12px_rgba(227,90,137,0.55)] hover:brightness-110 hover:-translate-y-0.5 transition-transform`}>
              {c.cta} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to={demoPath} data-testid={`section-${vertical}-demo`} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border-2 border-[#e0c07a] text-[#8a6420] text-base font-semibold hover:bg-amber-50 transition-colors">
              <span className="w-6 h-6 rounded-full bg-[#C89B52] text-white flex items-center justify-center"><Play className="w-3 h-3 fill-current ml-px" /></span> {c.demo}
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-6 text-sm text-slate-600">
            {["No credit card required", "Cancel anytime", "Setup in minutes"].map(t => <span key={t} className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t}</span>)}
          </div>
        </div>
        <SuiteShowcase c={c} salon={salon} cur={cur} vertical={vertical} />
      </div>

      <div className={`grid sm:grid-cols-2 gap-5 mt-16 ${salon ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {tiles.map(([I, t, d, mock, tone]) => (
          <Link to="/features" key={t} data-testid={`tile-${vertical}-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            className="group relative flex rounded-[26px] bg-white border border-[#efe3c8] p-5 sm:p-6 min-h-[224px] overflow-hidden shadow-[0_10px_30px_-20px_rgba(120,90,40,0.3)] hover:-translate-y-1 hover:shadow-[0_28px_60px_-28px_rgba(184,134,59,0.5)] hover:border-[#C89B52]/60 transition-[transform,box-shadow,border-color] duration-300">
            <div className="relative z-10 w-[54%] flex flex-col pr-1">
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}><I className="w-6 h-6" /></span>
              <h3 className="font-bold text-slate-900 text-[15px] leading-snug mt-4">{t}</h3>
              <p className="text-[12.5px] text-slate-500 mt-1.5 leading-relaxed">{d}</p>
            </div>
            <div className="absolute right-1 sm:right-2 top-5 bottom-14 w-[46%] flex items-center justify-center group-hover:-translate-y-1 transition-transform duration-500" aria-hidden="true">
              <div className={`origin-center ${salon ? "scale-[0.82] xl:scale-[0.88] 2xl:scale-100" : "scale-90 xl:scale-100"}`}><MiniMock kind={mock} cur={cur} us={us} /></div>
            </div>
            <span className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-[#F6EBD2] text-[#8a6420] flex items-center justify-center group-hover:bg-[#C89B52] group-hover:text-white transition-colors"><ArrowRight className="w-4 h-4" /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

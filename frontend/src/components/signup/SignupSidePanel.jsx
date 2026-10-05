import { CalendarDays, Receipt, Users, Boxes, HeartHandshake, UtensilsCrossed, ClipboardList, Scissors, Bell, Check, TrendingUp, Star, ShieldCheck, Heart } from "lucide-react";
import { PhoneMock, TabletMock } from "@/components/landing/MiniMocks";

const SALON = {
  I: Scissors, img: "/landing/hero-salon.jpg", grad: "from-[#E35A89] to-[#f97316]", labelTone: "bg-rose-50 border-rose-200 text-rose-600",
  title: ["Grow Your", "Salon Online"],
  sub: "Get more bookings, manage staff, services, inventory and customers — all in one platform with Mira AI.",
  tagline: ["More Clients", "Happier Business"],
  live: ["New Booking", "Hair Cut · 10:00 AM"], badge: "More\nBookings",
  features: [
    [CalendarDays, "Online Appointment Booking", "Let customers book 24/7", "from-violet-400 to-indigo-500"],
    [Receipt, "POS & Billing", "GST ready, fast and easy", "from-emerald-400 to-teal-500"],
    [Users, "Staff & Scheduling", "Manage staff, shifts and attendance", "from-rose-400 to-pink-500"],
    [Boxes, "Inventory Management", "Track products and stock", "from-sky-400 to-blue-500"],
    [HeartHandshake, "Customer CRM", "Loyalty, offers and marketing", "from-amber-400 to-orange-500"],
  ],
};
const RESTO = {
  I: UtensilsCrossed, img: "/landing/hero-restaurant.jpg", grad: "from-[#f97316] to-[#E35A89]", labelTone: "bg-orange-50 border-orange-200 text-orange-600",
  title: ["Bring Your", "Restaurant Online"],
  sub: "Get more bookings, manage orders, tables, staff and customers — all in one platform with Mira AI.",
  tagline: ["More Diners", "Happier Business"],
  live: ["New Order", "Table 3 · 2× Biryani"], badge: "Faster\nTables",
  features: [
    [CalendarDays, "Online Table Reservations", "Let customers book tables 24/7", "from-violet-400 to-indigo-500"],
    [Receipt, "POS & Billing", "GST ready, fast and easy", "from-emerald-400 to-teal-500"],
    [ClipboardList, "Menu & Order Management", "Dine-in, takeaway and delivery", "from-amber-400 to-orange-500"],
    [HeartHandshake, "Customer CRM", "Loyalty, offers and marketing", "from-rose-400 to-pink-500"],
  ],
};

const fmtINR = (n) => "₹" + Number(n).toLocaleString("en-IN");
// Lowest monthly price for this vertical + currency, straight from the HQ plan catalog.
export function startingPrice(catalog, resto, isIntl) {
  if (!catalog) return "";
  if (!resto) {
    const p = isIntl ? catalog.intl_starter_monthly?.price : catalog.monthly?.price;
    return p == null ? "" : isIntl ? `$${p}` : fmtINR(p);
  }
  const cur = isIntl ? "USD" : "INR";
  const plans = Object.values(catalog).filter(v => v && typeof v === "object" && v.vertical === "restaurant" && (v.currency || "INR") === cur)
    .sort((a, b) => (a.duration_days || 0) - (b.duration_days || 0));
  return plans[0]?.price == null ? "" : isIntl ? `$${plans[0].price}` : fmtINR(plans[0].price);
}

export function SignupSidePanel({ resto = false, isIntl = false, catalog = null }) {
  const c = resto ? RESTO : SALON;
  const cur = isIntl ? "$" : "₹";
  const from = startingPrice(catalog, resto, isIntl);
  const features = isIntl ? c.features.map(([I, t, s, g]) => [I, t, s.replace("GST ready, ", "Tax ready, "), g]) : c.features;
  return (
    <aside className="lg:sticky lg:top-24 animate-fade-up" data-testid="signup-side-panel">
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${c.labelTone}`} data-testid="signup-side-label">
        <c.I className="w-3.5 h-3.5" /> {resto ? "Restaurant" : "Salon"} · {isIntl ? "US / International" : "India"}
      </span>
      <h1 className="font-playfair text-4xl xl:text-5xl leading-[1.05] mt-4 text-[#141a33]" data-testid="signup-side-title">
        {c.title[0]}<br /><span className={`text-transparent bg-clip-text bg-gradient-to-r ${c.grad}`}>{c.title[1]}</span>
      </h1>
      <p className="text-base text-slate-600 mt-4 leading-relaxed max-w-md" data-testid="signup-side-sub">{c.sub}</p>

      <div className="relative mt-7 mr-6" data-testid="signup-side-showcase">
        <div className="rounded-[26px] overflow-hidden h-52 xl:h-60 border border-[#efe3c8] shadow-[0_30px_70px_-36px_rgba(184,134,59,0.55)]">
          <img src={c.img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover object-left" />
        </div>
        <div className="absolute left-3 bottom-5 flex items-center gap-2 rounded-2xl bg-white/95 backdrop-blur pl-1.5 pr-3 py-1.5 shadow-xl max-w-[58%]">
          <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Bell className="w-3.5 h-3.5" /></span>
          <span className="min-w-0 leading-tight"><span className="block text-[12px] font-bold text-slate-900 truncate">{c.live[0]}</span><span className="block text-[10px] text-slate-500 truncate">{c.live[1]}</span></span>
          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" strokeWidth={3} /></span>
        </div>
        <div className="absolute right-0 -bottom-3 drop-shadow-2xl" aria-hidden="true">{resto ? <TabletMock cur={cur} className="!w-[150px]" /> : <PhoneMock cur={cur} compact />}</div>
        <div className={`absolute -top-3 -right-3 flex items-center gap-2 rounded-2xl bg-gradient-to-br ${c.grad} text-white px-3 py-2 shadow-[0_16px_34px_-14px_rgba(0,0,0,0.4)]`}>
          <TrendingUp className="w-4 h-4" /><span className="text-[11px] font-extrabold leading-tight whitespace-pre-line">{c.badge}</span>
        </div>
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-3" data-testid="signup-side-features">
        {features.map(([Icon, t, s, g]) => (
          <li key={t} className="flex items-center gap-3 rounded-2xl bg-white border border-[#efe3c8] px-3 py-2.5 shadow-[0_8px_24px_-18px_rgba(120,90,40,0.35)]">
            <span className={`w-10 h-10 rounded-full bg-gradient-to-br ${g} text-white flex items-center justify-center shrink-0 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.35)]`}><Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" /></span>
            <span className="min-w-0"><span className="block text-sm font-bold text-slate-800">{t}</span><span className="block text-xs text-slate-500">{s}</span></span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-semibold text-slate-600" data-testid="signup-side-trust">
        {from && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FBF1DC] border border-[#E8D4A8] text-[#7a5a1e]" data-testid="signup-side-price">Starts from <b className="text-slate-900">{from}</b>/mo after trial</span>}
        <span className="inline-flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> All-in-one</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-[#b8863b]" /> 0% commission</span>
        <span className="inline-flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> Loved by owners</span>
      </div>

      <div className="mt-8 ml-10 -rotate-6 font-caveat text-4xl text-[#1c1c22] leading-[0.95]" data-testid="signup-side-tagline">
        {c.tagline[0]}<br /><span className="pl-6">{c.tagline[1]}</span>
        <svg viewBox="0 0 220 14" className="w-56 h-3 mt-1 ml-4 text-[#d4af37]" aria-hidden="true"><path d="M2 10 C 60 2, 150 2, 218 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      </div>
    </aside>
  );
}

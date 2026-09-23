import { useEffect, useState } from "react";
import { Calendar, Users, Heart, CreditCard, Utensils, ChefHat, QrCode, Receipt, ShieldCheck, Sparkles, XCircle, Star, Quote } from "lucide-react";
import { SidebarMiracurlLogo } from "@/components/MasterBrand";
import { DashboardAurora } from "@/components/DashboardAurora";

const SALON = {
  photo: "/assets/onboarding/salon-interior.jpg",
  bot: "/assets/dashboard/mira-dj.png",
  script: "Good Hair · Brighter You",
  h1: ["Empower Your", "Luxe Salon & Spa"],
  sub: "One AI-powered salon OS for bookings, POS billing, WhatsApp marketing and client loyalty.",
  feats: [
    [Calendar, "Online Bookings", "24/7 self-service scheduling & WhatsApp reminders"],
    [Users, "Staff & Roster", "Commission tracking & auto attendance"],
    [Heart, "Client CRM", "Automated re-booking & personalised offers"],
    [CreditCard, "Luxe POS", "GST invoices, packages & instant pay links"],
  ],
  mira: "Hi! I'm Mira — I'll set up your salon in under 2 minutes ✦",
  quotes: [
    { name: "Kavita R.", role: "Owner · Glow Unisex Salon, Bangalore", img: "https://images.pexels.com/photos/17163945/pexels-photo-17163945.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=160&w=160", quote: "Bookings doubled in a month. Mira answers my clients at midnight while I sleep." },
    { name: "Farhan S.", role: "Unisex Salon · Pune", img: "https://images.pexels.com/photos/8834025/pexels-photo-8834025.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=160&w=160", quote: "GST bills, staff salaries, inventory — I closed three other apps and my notebook." },
    { name: "Priya Sharma", role: "Owner · Salon & Spa, Bangalore", img: "", quote: "Our revenue grew 40% in 3 months. WhatsApp bookings and staff commissions are pure magic!" },
  ],
};
const RESTO = {
  photo: "/assets/onboarding/restaurant-candle.jpg",
  bot: "/assets/dashboard/mira-energy.png",
  script: "Good Food · Great Business",
  h1: ["Elevate Your", "Dining & Bistro"],
  sub: "A modern restaurant platform for table reservations, kitchen KOT, QR menus and speed billing.",
  feats: [
    [Utensils, "Table Reservations", "Instant table booking & waitlist"],
    [ChefHat, "Kitchen KOT", "Real-time order routing & display"],
    [QrCode, "QR Ordering", "Contactless ordering & digital menu"],
    [Receipt, "Speed Billing", "Split bills, table transfers & register"],
  ],
  mira: "Hi! I'm Mira — I'll get your restaurant live in under 2 minutes ✦",
  quotes: [
    { name: "Rohit M.", role: "Owner · Infinity Family Restaurant", img: "", quote: "QR ordering cut our waiter trips in half and the kitchen screen ended the shouting." },
    { name: "Anita D.", role: "Café & Bakery · Hyderabad", img: "", quote: "Table reservations, KOT and split bills in one place — Sunday rush finally feels calm." },
    { name: "Sameer K.", role: "Family Dining · Mumbai", img: "", quote: "Daily register closes itself now. I check the numbers on my phone before bed." },
  ],
};

export const TRUST_BADGES = [[Sparkles, "30-day free trial"], [ShieldCheck, "No credit card"], [XCircle, "Cancel anytime"]];

function TestimonialCard({ quotes }) {
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); const t = setInterval(() => setI(n => (n + 1) % quotes.length), 5200); return () => clearInterval(t); }, [quotes]);
  const q = quotes[i];
  return (
    <div className="relative rounded-2xl p-4 pr-5 bg-gradient-to-br from-[#d4af37]/[.14] to-white/[.03] border border-[#d4af37]/35 backdrop-blur-md overflow-hidden" data-testid="signup-testimonial-card" data-index={i}>
      <Quote className="absolute -top-1 right-3 w-10 h-10 text-[#d4af37]/25" />
      <div key={i} className="su-quote-in">
        <div className="flex gap-0.5 text-[#f6e27a] mb-2">{[0, 1, 2, 3, 4].map(k => <Star key={k} className="w-3.5 h-3.5 fill-current" />)}</div>
        <p className="font-playfair italic text-[15px] leading-snug text-white/95" data-testid="signup-testimonial-quote">“{q.quote}”</p>
        <div className="mt-3 flex items-center gap-2.5">
          {q.img ? <img src={q.img} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-[#d4af37]/60" />
            : <span className="w-8 h-8 rounded-full bg-[#d4af37]/20 ring-2 ring-[#d4af37]/60 grid place-items-center text-[#f6e27a] text-xs font-bold">{q.name[0]}</span>}
          <div><div className="text-sm font-semibold text-[#f3e3ae]">{q.name}</div><div className="text-[11px] text-white/60">{q.role}</div></div>
        </div>
      </div>
      <div className="absolute bottom-3 right-4 flex gap-1.5" data-testid="signup-testimonial-dots">
        {quotes.map((_, k) => <button key={k} type="button" aria-label={`Testimonial ${k + 1}`} onClick={() => setI(k)} className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-[#f6e27a]" : "w-1.5 bg-white/30"}`} />)}
      </div>
    </div>
  );
}

function LiveCounter({ resto }) {
  const base = 1240, [n, setN] = useState(base - 60);
  useEffect(() => { let cur = base - 60; const t = setInterval(() => { cur = Math.min(base, cur + 3); setN(cur); if (cur >= base) clearInterval(t); }, 40); return () => clearInterval(t); }, []);
  return (
    <div className="flex items-center gap-2.5 text-xs text-white/75" data-testid="signup-live-counter">
      <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" /></span>
      <span><b className="text-[#f6e27a] font-semibold tabular-nums" data-testid="signup-live-counter-value">{n.toLocaleString("en-IN")}+</b> salons &amp; restaurants onboarded{resto ? " · 180+ restaurants this year" : " · joining every day"}</span>
    </div>
  );
}

export function SignupHeroPanel({ resto = false, trialLabel }) {
  const v = resto ? RESTO : SALON;
  return (
    <aside className="gold-night-canvas relative isolate overflow-hidden text-white rounded-[28px] lg:rounded-none lg:min-h-[calc(100vh-5rem)] border border-[#d4af37]/25 lg:border-0 lg:border-r lg:border-[#d4af37]/25 shadow-[0_30px_80px_-30px_rgba(0,0,0,.6)]"
      data-testid="signup-left-brand-panel" data-vertical={resto ? "restaurant" : "salon"}>
      <DashboardAurora />
      <div className="relative z-10 p-6 sm:p-8 xl:p-10 flex flex-col gap-6 su-stagger">
        <div className="flex items-start justify-between gap-4">
          <div className="w-[230px] -ml-2"><SidebarMiracurlLogo /></div>
          <span className="hidden sm:block font-caveat text-[#e8c56a] text-xl leading-tight text-right sidebar-tagline" data-testid="signup-hero-script">{v.script}</span>
        </div>

        <div>
          <h1 className="font-playfair text-3xl sm:text-5xl leading-[1.05]" data-testid="signup-hero-headline">
            {v.h1[0]}<br /><span className="su-gold-word" data-text={v.h1[1]}>{v.h1[1]}</span>
          </h1>
          <p className="text-white/70 text-sm sm:text-base mt-3 max-w-md">{v.sub}</p>
        </div>

        <div className="hidden sm:block relative rounded-2xl overflow-hidden border border-[#d4af37]/30 shadow-2xl group aspect-[16/9]" data-testid="signup-hero-photo">
          <img src={v.photo} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0907] via-[#0a0907]/40 to-transparent" />
          <div className="absolute inset-0 ring-1 ring-inset ring-[#d4af37]/30 rounded-2xl" />
          <div className="absolute left-4 bottom-3 flex items-center gap-3 p-2.5 pr-4 rounded-2xl bg-[#0a0907]/70 border border-[#d4af37]/35 backdrop-blur-md" data-testid="signup-mira-bot-badge">
            <span className="relative w-12 h-12 shrink-0 su-float"><img src={v.bot} alt="Mira" className="w-full h-full object-contain drop-shadow-[0_6px_12px_rgba(232,197,106,.45)]" /></span>
            <span className="text-xs text-white/90 leading-snug max-w-[220px]">{v.mira}</span>
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          </div>
        </div>

        <div className="hidden sm:grid grid-cols-2 gap-3" data-testid="signup-feature-tiles">
          {v.feats.map(([Icon, t, d]) => (
            <div key={t} className="rounded-xl p-3.5 bg-white/[.04] backdrop-blur-md border border-[#d4af37]/20 hover:border-[#d4af37]/50 transition-colors duration-300">
              <div className="w-8 h-8 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/30 flex items-center justify-center text-[#f6e27a] mb-2"><Icon className="w-4 h-4" /></div>
              <div className="font-semibold text-sm">{t}</div>
              <div className="text-xs text-white/65 mt-0.5">{d}</div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block"><TestimonialCard quotes={v.quotes} /></div>

        <div className="flex flex-wrap gap-2" data-testid="signup-trust-badges">
          {TRUST_BADGES.map(([Icon, t], i) => (
            <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#f6e27a] text-xs font-medium">
              <Icon className="w-3.5 h-3.5" /> {i === 0 && trialLabel ? trialLabel : t}
            </span>
          ))}
        </div>
        <LiveCounter resto={resto} />
      </div>
    </aside>
  );
}

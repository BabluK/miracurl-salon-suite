import { Calendar, Users, Heart, CreditCard, Utensils, ChefHat, QrCode, Receipt, ShieldCheck, Sparkles, XCircle } from "lucide-react";
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
};

export const TRUST_BADGES = [[Sparkles, "30-day free trial"], [ShieldCheck, "No credit card"], [XCircle, "Cancel anytime"]];

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

        <div className="flex flex-wrap gap-2" data-testid="signup-trust-badges">
          {TRUST_BADGES.map(([Icon, t], i) => (
            <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#f6e27a] text-xs font-medium">
              <Icon className="w-3.5 h-3.5" /> {i === 0 && trialLabel ? trialLabel : t}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

import { Scissors, Utensils, CheckCircle2, CalendarDays, CreditCard, Users, Package, UserCog, BarChart3, Bot, Megaphone, Globe, ShieldCheck, Store } from "lucide-react";

const SALON = ["Online Bookings", "Client Management", "Staff Scheduling", "POS & Billing", "Inventory", "Loyalty & Memberships", "Marketing Studio"];
const RESTO = ["Online Reservations", "Table Management", "POS & Billing", "Menu & Inventory", "Staff Management", "CRM & Loyalty", "Marketing & Offers"];
const MODULES = [[CalendarDays, "Appointments & Reservations"], [CreditCard, "POS & Billing"], [Users, "CRM & Loyalty"], [Package, "Inventory Management"], [UserCog, "Staff Management"], [BarChart3, "Reports & Analytics"], [Bot, "Mira AI Assistant"], [Megaphone, "Marketing Studio"]];
const COUNTRIES = ["🇺🇸 US", "🇬🇧 UK", "🇦🇪 UAE", "🇮🇳 India", "🇦🇺 Australia", "🇸🇬 Singapore", "🇨🇦 Canada"];


export function LoginShowcase() {
  return (
    <div className="hidden lg:flex flex-col gap-3 min-w-0" data-testid="login-showcase">
      <div className="flex items-start justify-between gap-6">
        <img src="/assets/brand/ms-suite-banner.png" alt="Miracurl Suite — Smart Salon & Restaurant Management Software" data-testid="login-brand-logo"
          className="w-[420px] max-w-full h-auto object-contain drop-shadow-[0_10px_30px_rgba(212,175,55,0.35)]" />
        <div className="font-playfair italic text-[#e8c56a] text-2xl leading-tight text-right pr-6 pt-2 -rotate-6 sidebar-tagline">Businesses<br />Run Better<br />With AI ♡</div>
      </div>

      <div>
        <h1 className="font-playfair text-4xl xl:text-[3rem] leading-[1.08] text-white drop-shadow-sm" data-testid="login-showcase-heading">
          One Platform.<br /><span className="text-[#e8c56a]">Two Industries.</span> Endless Possibilities.
        </h1>
        <p className="text-xl font-semibold text-[#f3e3ae] tracking-wide mt-3">Manage. Automate. Grow.</p>
        <p className="text-white/65 text-sm mt-1">Everything you need to run your salon or restaurant — in one powerful platform.</p>
      </div>

      <div className="grid grid-cols-2 rounded-[2rem] overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-[#d4af37]/30">
        <div className="relative min-h-[300px] bg-[#f6dfe6]" data-testid="login-salon-card">
          <img src="/assets/login/salon-people.jpg" alt="Stylist with a happy client" className="absolute inset-y-0 left-0 w-[52%] h-full object-cover object-[35%_20%]" style={{ WebkitMaskImage: "linear-gradient(90deg, #000 70%, transparent)", maskImage: "linear-gradient(90deg, #000 70%, transparent)" }} />
          <div className="relative ml-[50%] p-5 pl-3">
            <div className="flex items-center gap-2 text-rose-600 font-bold tracking-[0.2em] text-sm mb-3"><Scissors className="w-5 h-5" /> SALONS</div>
            <ul className="space-y-1.5">{SALON.map(f => <li key={f} className="flex items-center gap-2 text-[13px] text-slate-800"><CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0 fill-rose-100" /> {f}</li>)}</ul>
            <div className="font-playfair italic text-rose-500 text-lg mt-4 leading-tight -rotate-6 origin-left">Beautiful<br />Businesses<br />Grow Here ♡</div>
            <a href="/features" className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-full bg-rose-600 text-white text-xs font-bold shadow hover:bg-rose-700 transition-colors" data-testid="login-explore-salon">Explore Salon Features →</a>
          </div>
        </div>
        <div className="relative min-h-[300px] bg-[#1d140a] text-white" data-testid="login-restaurant-card">
          <img src="/assets/login/restaurant.jpg" alt="Restaurant table" className="absolute inset-y-0 right-0 w-[48%] h-full object-cover" style={{ WebkitMaskImage: "linear-gradient(270deg, #000 60%, transparent)", maskImage: "linear-gradient(270deg, #000 60%, transparent)" }} />
          <div className="relative mr-[42%] p-5">
            <div className="flex items-center gap-2 text-[#f0d27a] font-bold tracking-[0.2em] text-sm mb-3"><Utensils className="w-5 h-5" /> RESTAURANTS</div>
            <ul className="space-y-1.5">{RESTO.map(f => <li key={f} className="flex items-center gap-2 text-[13px] text-white/90"><CheckCircle2 className="w-4 h-4 text-[#f0d27a] shrink-0" /> {f}</li>)}</ul>
            <div className="font-playfair italic text-[#f0d27a] text-lg mt-4 leading-tight -rotate-6 origin-left">Great Food<br />Brings People<br />Together ♡</div>
            <a href="/restaurant" className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-full bg-[#f0d27a] text-[#1d140a] text-xs font-bold shadow hover:bg-[#f7e2a0] transition-colors" data-testid="login-explore-restaurant">Explore Restaurant Features →</a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-2 rounded-2xl bg-white/[.06] backdrop-blur border border-[#d4af37]/20 p-3 shadow-lg shadow-black/40" data-testid="login-modules">
        {MODULES.map(([Icon, l]) => (
          <div key={l} className="rounded-xl bg-white/[.05] border border-white/10 p-2.5 text-center">
            <Icon className="w-5 h-5 mx-auto text-[#e8c56a]" />
            <div className="text-[10px] leading-tight text-white/80 mt-1.5">{l}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white/[.06] backdrop-blur border border-[#d4af37]/20 px-5 py-3.5 shadow-lg shadow-black/40 flex items-center gap-6 text-xs text-white/70 [&_.font-bold]:text-white [&_.bg-slate-200]:bg-white/15 [&_.text-slate-600]:text-white/60 [&_.text-\[\#b58a2c\]]:text-[#e8c56a]" data-testid="login-trust-strip">
        <div className="flex items-center gap-2.5 shrink-0"><Store className="w-6 h-6 text-[#b58a2c]" /><div><div className="font-bold text-slate-900 text-sm">1000+</div>Happy Businesses</div></div>
        <div className="h-8 w-px bg-slate-200" />
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Globe className="w-6 h-6 text-[#b58a2c] shrink-0" />
          <div className="min-w-0">
            <div className="font-bold text-slate-900 text-sm">Trusted in multiple countries</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600" data-testid="login-countries">{COUNTRIES.map(c => <span key={c}>{c}</span>)}<span className="text-[#b58a2c] font-semibold">& more</span></div>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div className="flex items-center gap-2.5 shrink-0"><ShieldCheck className="w-6 h-6 text-[#b58a2c]" /><div><div className="font-bold text-slate-900 text-sm">Secure. Reliable.</div>Always On.</div></div>
      </div>
    </div>
  );
}

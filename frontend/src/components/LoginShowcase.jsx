import { Scissors, Utensils, CheckCircle2, CalendarDays, CreditCard, Users, Package, UserCog, BarChart3, Bot, Megaphone, Globe, ShieldCheck, Store } from "lucide-react";

const SALON = ["Online Bookings", "Client Management", "Staff Scheduling", "POS & Billing", "Inventory", "Loyalty & Memberships", "Marketing Studio"];
const RESTO = ["Online Reservations", "Table Management", "POS & Billing", "Menu & Inventory", "Staff Management", "CRM & Loyalty", "Marketing & Offers"];
const MODULES = [[CalendarDays, "Appointments & Reservations"], [CreditCard, "POS & Billing"], [Users, "CRM & Loyalty"], [Package, "Inventory Management"], [UserCog, "Staff Management"], [BarChart3, "Reports & Analytics"], [Bot, "Mira AI Assistant"], [Megaphone, "Marketing Studio"]];
const COUNTRIES = ["🇺🇸 US", "🇬🇧 UK", "🇦🇪 UAE", "🇮🇳 India", "🇦🇺 Australia", "🇸🇬 Singapore", "🇨🇦 Canada"];

export function LoginShowcase() {
  return (
    <div className="hidden lg:flex flex-col gap-5 min-w-0" data-testid="login-showcase">
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <img src="/assets/brand/ms-logo-dark.png" alt="Miracurl Suite" className="w-24 h-24 rounded-full shadow-xl shadow-amber-900/25 ring-2 ring-[#d4af37]/70" data-testid="login-brand-logo" />
          <div>
            <div className="font-playfair text-[2rem] leading-none tracking-wide text-[#8a6a1c]">MIRACURL SUITE</div>
            <div className="text-[11px] tracking-[0.22em] font-semibold text-slate-700 mt-1.5">AI-POWERED BUSINESS MANAGEMENT PLATFORM</div>
            <div className="mt-3 pt-2 border-t border-slate-400/50 text-[11px] tracking-[0.25em] font-semibold text-slate-800">SALONS &nbsp;|&nbsp; RESTAURANTS &nbsp;|&nbsp; AND BEYOND</div>
          </div>
        </div>
        <div className="font-playfair italic text-[#b58a2c] text-2xl leading-tight text-right pr-6 pt-2 -rotate-6">Businesses<br />Run Better<br />With AI ♡</div>
      </div>

      <div>
        <h1 className="font-playfair text-4xl xl:text-[3.1rem] leading-[1.08] text-slate-900 drop-shadow-sm" data-testid="login-showcase-heading">
          One Platform.<br /><span className="text-[#b58a2c]">Two Industries.</span> Endless Possibilities.
        </h1>
        <p className="text-xl font-semibold text-slate-800 mt-3">Manage. Automate. Grow.</p>
        <p className="text-slate-700 text-sm mt-1">Everything you need to run your salon or restaurant — in one powerful platform.</p>
      </div>

      <div className="grid grid-cols-2 rounded-[2rem] overflow-hidden shadow-2xl shadow-rose-900/15 ring-1 ring-white/60">
        <div className="relative min-h-[330px] bg-[#f6dfe6]" data-testid="login-salon-card">
          <img src="/assets/login/salon-people.jpg" alt="Stylist with a happy client" className="absolute inset-y-0 left-0 w-[52%] h-full object-cover object-[35%_20%]" style={{ WebkitMaskImage: "linear-gradient(90deg, #000 70%, transparent)", maskImage: "linear-gradient(90deg, #000 70%, transparent)" }} />
          <div className="relative ml-[50%] p-5 pl-3">
            <div className="flex items-center gap-2 text-rose-600 font-bold tracking-[0.2em] text-sm mb-3"><Scissors className="w-5 h-5" /> SALONS</div>
            <ul className="space-y-1.5">{SALON.map(f => <li key={f} className="flex items-center gap-2 text-[13px] text-slate-800"><CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0 fill-rose-100" /> {f}</li>)}</ul>
            <div className="font-playfair italic text-rose-500 text-lg mt-4 leading-tight -rotate-6 origin-left">Beautiful<br />Businesses<br />Grow Here ♡</div>
          </div>
        </div>
        <div className="relative min-h-[330px] bg-[#1d140a] text-white" data-testid="login-restaurant-card">
          <img src="/assets/login/restaurant.jpg" alt="Restaurant table" className="absolute inset-y-0 right-0 w-[48%] h-full object-cover" style={{ WebkitMaskImage: "linear-gradient(270deg, #000 60%, transparent)", maskImage: "linear-gradient(270deg, #000 60%, transparent)" }} />
          <div className="relative mr-[42%] p-5">
            <div className="flex items-center gap-2 text-[#f0d27a] font-bold tracking-[0.2em] text-sm mb-3"><Utensils className="w-5 h-5" /> RESTAURANTS</div>
            <ul className="space-y-1.5">{RESTO.map(f => <li key={f} className="flex items-center gap-2 text-[13px] text-white/90"><CheckCircle2 className="w-4 h-4 text-[#f0d27a] shrink-0" /> {f}</li>)}</ul>
            <div className="font-playfair italic text-[#f0d27a] text-lg mt-4 leading-tight -rotate-6 origin-left">Great Food<br />Brings People<br />Together ♡</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-2 rounded-2xl bg-white/85 backdrop-blur border border-white p-3 shadow-lg shadow-slate-300/50" data-testid="login-modules">
        {MODULES.map(([Icon, l]) => (
          <div key={l} className="rounded-xl bg-[#faf6ef] border border-[#efe6d2] p-2.5 text-center">
            <Icon className="w-5 h-5 mx-auto text-slate-800" />
            <div className="text-[10px] leading-tight text-slate-700 mt-1.5">{l}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white/85 backdrop-blur border border-white px-5 py-3.5 shadow-lg shadow-slate-300/40 flex items-center gap-6 text-xs text-slate-700" data-testid="login-trust-strip">
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

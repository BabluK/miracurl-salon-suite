import { Scissors, Utensils, CheckCircle2, CalendarDays, CreditCard, Users, Package, UserCog, BarChart3, Bot, Megaphone, Globe, ShieldCheck, Store } from "lucide-react";

const SALON = ["Online Bookings", "Client Management", "Staff Scheduling", "POS & Billing", "Inventory", "Loyalty & Memberships", "Marketing Studio"];
const RESTO = ["Online Reservations", "Table Management", "POS & Billing", "Menu & Inventory", "Staff Management", "CRM & Loyalty", "Marketing & Offers"];
const MODULES = [[CalendarDays, "Appointments & Reservations"], [CreditCard, "POS & Billing"], [Users, "CRM & Loyalty"], [Package, "Inventory Management"], [UserCog, "Staff Management"], [BarChart3, "Reports & Analytics"], [Bot, "Mira AI Assistant"], [Megaphone, "Marketing Studio"]];

export function LoginShowcase() {
  return (
    <div className="hidden lg:flex flex-col gap-5 min-w-0" data-testid="login-showcase">
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <img src="/assets/brand/ms-logo-dark.png" alt="Miracurl Suite" className="w-24 h-24 rounded-full shadow-xl shadow-amber-900/20 ring-2 ring-[#d4af37]/60" data-testid="login-brand-logo" />
          <div>
            <div className="font-playfair text-[2rem] leading-none tracking-wide text-[#8a6a1c]">MIRACURL SUITE</div>
            <div className="text-[11px] tracking-[0.22em] font-semibold text-slate-700 mt-1.5">AI-POWERED BUSINESS MANAGEMENT PLATFORM</div>
            <div className="mt-3 pt-2 border-t border-slate-300 text-[11px] tracking-[0.25em] font-semibold text-slate-800">SALONS &nbsp;|&nbsp; RESTAURANTS &nbsp;|&nbsp; AND BEYOND</div>
          </div>
        </div>
        <div className="font-playfair italic text-[#b58a2c] text-2xl leading-tight text-right pr-6 pt-2">Businesses<br />Run Better<br />With AI ♡</div>
      </div>

      <div>
        <h1 className="font-playfair text-4xl xl:text-5xl leading-[1.08] text-slate-900" data-testid="login-showcase-heading">
          One Platform.<br /><span className="text-[#b58a2c]">Two Industries.</span> Endless Possibilities.
        </h1>
        <p className="text-xl font-semibold text-slate-800 mt-3">Manage. Automate. Grow.</p>
        <p className="text-slate-600 text-sm mt-1">Everything you need to run your salon or restaurant — in one powerful platform.</p>
      </div>

      <div className="grid grid-cols-2 gap-0 rounded-3xl overflow-hidden shadow-xl shadow-rose-200/40">
        <div className="relative p-6 bg-gradient-to-br from-[#fbe4ea] via-[#fdeef2] to-[#f8d9e2] min-h-[300px]">
          <img src="/assets/dashboard/hero-salon.jpg" alt="" className="absolute left-0 bottom-0 w-[46%] h-[80%] object-cover rounded-tr-[3rem] opacity-90" />
          <div className="relative ml-[46%] pl-4">
            <div className="flex items-center gap-2 text-rose-600 font-semibold tracking-[0.2em] text-sm mb-3"><Scissors className="w-5 h-5" /> SALONS</div>
            <ul className="space-y-1.5">{SALON.map(f => <li key={f} className="flex items-center gap-2 text-[13px] text-slate-800"><CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" /> {f}</li>)}</ul>
            <div className="font-playfair italic text-rose-500 text-base mt-4 leading-tight">Beautiful<br />Businesses<br />Grow Here ♡</div>
          </div>
        </div>
        <div className="relative p-6 bg-gradient-to-br from-[#2a1d10] via-[#3a2a17] to-[#1b130a] text-white min-h-[300px]">
          <img src="/assets/offers/dining.jpg" alt="" className="absolute right-0 bottom-0 w-[44%] h-[70%] object-cover rounded-tl-[3rem] opacity-80" />
          <div className="relative mr-[40%]">
            <div className="flex items-center gap-2 text-[#f0d27a] font-semibold tracking-[0.2em] text-sm mb-3"><Utensils className="w-5 h-5" /> RESTAURANTS</div>
            <ul className="space-y-1.5">{RESTO.map(f => <li key={f} className="flex items-center gap-2 text-[13px] text-white/90"><CheckCircle2 className="w-4 h-4 text-[#f0d27a] shrink-0" /> {f}</li>)}</ul>
            <div className="font-playfair italic text-[#f0d27a] text-base mt-4 leading-tight">Great Food<br />Brings People<br />Together ♡</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-2 rounded-2xl bg-white/80 backdrop-blur border border-white p-3 shadow-lg shadow-slate-200/60" data-testid="login-modules">
        {MODULES.map(([Icon, l]) => (
          <div key={l} className="rounded-xl bg-[#faf6ef] border border-[#efe6d2] p-2.5 text-center">
            <Icon className="w-5 h-5 mx-auto text-slate-800" />
            <div className="text-[10px] leading-tight text-slate-700 mt-1.5">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-2xl bg-[#fbf3e6] border border-[#f1e3c6] px-5 py-3 text-xs text-slate-700" data-testid="login-trust-strip">
        <div className="flex items-center gap-2"><Store className="w-5 h-5 text-[#b58a2c]" /><div><b>1000+</b><br />Happy Businesses</div></div>
        <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-[#b58a2c]" /><div><b>Multiple Countries</b><br />US · UK · UAE · India · Australia</div></div>
        <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#b58a2c]" /><div><b>Secure. Reliable.</b><br />Always On.</div></div>
      </div>
    </div>
  );
}

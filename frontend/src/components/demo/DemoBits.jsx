import { CalendarDays, Users, Receipt, Bot, Zap, Clock, Star, User, Store, MapPin, Mail, Phone } from "lucide-react";

const FEATURES = [[CalendarDays, "Online Booking"], [Users, "Staff Management"], [Receipt, "POS & Billing"], [Bot, "Mira AI Assistant"]];

export function DemoFeatureRow() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 my-10 sm:my-14" data-testid="demo-feature-row">
      {FEATURES.map(([Icon, label]) => (
        <div key={label} className="flex flex-col items-center gap-3 text-center">
          <span className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center"><Icon className="w-7 h-7 text-pink-600" /></span>
          <span className="text-sm font-bold text-slate-800">{label}</span>
        </div>
      ))}
    </div>
  );
}

const TRUST = [[Zap, "No Obligation", "Just a relaxed walkthrough"], [Clock, "20 Minutes", "Live product demo"],
  [Users, "12+ AI Agents", "See them in action"], [Star, "Trusted by Salons", "Join growing salon network"]];

export function DemoTrustRow() {
  return (
    <div className="mt-10" data-testid="demo-trust-row">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        {TRUST.map(([Icon, t, s]) => (
          <div key={t} className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-full bg-amber-50 ring-1 ring-amber-200 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-amber-500" /></span>
            <div><p className="text-sm font-bold text-slate-800 leading-tight">{t}</p><p className="text-xs text-slate-500 mt-0.5">{s}</p></div>
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-slate-600 mt-8">Let's build a smarter, more beautiful tomorrow for your salon.</p>
      <span className="block w-16 h-[3px] bg-amber-400 rounded-full mx-auto mt-2" />
    </div>
  );
}

const ICONS = { name: User, salon_name: Store, city: MapPin, email: Mail, phone: Phone };

export function DemoField({ k, label, required, form, set, type = "text", placeholder, testid }) {
  const Icon = ICONS[k];
  return (
    <label className="block" data-testid={`${testid}-wrap`}>
      <span className="text-sm font-semibold text-slate-700">{label}{required && <span className="text-pink-500 ml-1">*</span>}</span>
      <span className="mt-1.5 flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-3 focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-100 transition-colors">
        <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input value={form[k]} onChange={set(k)} type={type} placeholder={placeholder} data-testid={testid}
          maxLength={120} className="flex-1 bg-transparent text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none" />
      </span>
    </label>
  );
}

export function SectionHead({ icon: Icon, title, sub, testid }) {
  return (
    <div className="flex items-center gap-4 mb-6" data-testid={testid}>
      <span className="w-14 h-14 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0"><Icon className="w-6 h-6 text-pink-600" /></span>
      <div><h2 className="text-base md:text-lg font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500 mt-0.5">{sub}</p></div>
    </div>
  );
}

import { CalendarDays, Receipt, Users, Boxes, HeartHandshake, UtensilsCrossed, ClipboardList } from "lucide-react";

const SALON = {
  title: ["Grow Your", "Salon Online"],
  sub: "Get more bookings, manage staff, services, inventory and customers — all in one platform with Mira AI.",
  tagline: ["More Clients", "Happier Business"],
  features: [
    [CalendarDays, "Online Appointment Booking", "Let customers book 24/7"],
    [Receipt, "POS & Billing", "GST ready, fast and easy"],
    [Users, "Staff & Scheduling", "Manage staff, shifts and attendance"],
    [Boxes, "Inventory Management", "Track products and stock"],
    [HeartHandshake, "Customer CRM", "Loyalty, offers and marketing"],
  ],
};
const RESTO = {
  title: ["Bring Your", "Restaurant Online"],
  sub: "Get more bookings, manage orders, tables, staff and customers — all in one platform with Mira AI.",
  tagline: ["More Diners", "Happier Business"],
  features: [
    [CalendarDays, "Online Table Reservations", "Let customers book tables 24/7"],
    [Receipt, "POS & Billing", "GST ready, fast and easy"],
    [ClipboardList, "Menu & Order Management", "Dine-in, takeaway and delivery"],
    [HeartHandshake, "Customer CRM", "Loyalty, offers and marketing"],
  ],
};

// Left column of the signup page — plain text pitch, no photos (fast, calm onboarding).
export function SignupSidePanel({ resto = false, isIntl = false }) {
  const c = resto ? RESTO : SALON;
  const features = isIntl ? c.features.map(([I, t, s]) => [I, t, s.replace("GST ready, ", "Tax ready, ")]) : c.features;
  return (
    <aside className="lg:sticky lg:top-24 animate-fade-up" data-testid="signup-side-panel">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FBF6EC] border border-[#D9B878]/40 text-xs font-semibold text-[#8a7048]" data-testid="signup-side-label">
        {resto ? <UtensilsCrossed className="w-3.5 h-3.5" /> : "💇"} {resto ? "Restaurant" : "Salon"} · {isIntl ? "US / International" : "India"}
      </span>
      <h1 className="font-playfair text-4xl sm:text-5xl leading-[1.05] mt-4 text-[#1c1c22]" data-testid="signup-side-title">
        {c.title[0]}<br /><span className="text-[#b8932e]">{c.title[1]}</span>
      </h1>
      <p className="text-base text-slate-600 mt-4 leading-relaxed max-w-md" data-testid="signup-side-sub">{c.sub}</p>
      <ul className="mt-7 space-y-4" data-testid="signup-side-features">
        {features.map(([Icon, t, s]) => (
          <li key={t} className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-white border border-[#e9e1cf] shadow-sm flex items-center justify-center text-[#b8932e] shrink-0"><Icon className="w-5 h-5" /></span>
            <span><span className="block text-sm font-bold text-slate-800">{t}</span><span className="block text-sm text-slate-500">{s}</span></span>
          </li>
        ))}
      </ul>
      <div className="mt-8 ml-10 sm:ml-24 -rotate-6 font-caveat text-4xl sm:text-5xl text-[#1c1c22] leading-[0.95]" data-testid="signup-side-tagline">
        {c.tagline[0]}<br /><span className="pl-6">{c.tagline[1]}</span>
        <svg viewBox="0 0 220 14" className="w-56 h-3 mt-1 ml-4 text-[#d4af37]" aria-hidden="true"><path d="M2 10 C 60 2, 150 2, 218 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      </div>
    </aside>
  );
}

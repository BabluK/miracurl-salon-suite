import { Calendar, Users, Heart, Receipt, Package, Star, QrCode, LayoutGrid, Megaphone } from "lucide-react";

const SALON = {
  img: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80",
  wash: "linear-gradient(180deg, rgba(255,214,232,.55) 0%, rgba(255,240,246,.82) 45%, rgba(255,255,255,.96) 100%)",
  script: "Good Hair Brighter You",
  h1: ["Beauty", "Business", "Made Smarter"],
  sub: "Manage bookings, staff, billing, customers and grow your salon with AI.",
  feats: [
    [Calendar, "Online Bookings", "24/7 reservations"], [Users, "Staff Management", "Attendance & payroll"],
    [Heart, "Customer CRM", "Loyalty & feedback"], [Receipt, "POS & Billing", "Fast & GST ready"], [Package, "Inventory Management", "Track products"],
  ],
  quote: "Miracurl Suite has simplified our salon operations and helped us grow 3x in just 6 months!",
  who: ["Priya Sharma", "Glow Unisex Salon, Bangalore"],
  foot: "More Beauty Stories Together ♡",
};
const RESTO = {
  img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
  wash: "linear-gradient(180deg, rgba(40,24,8,.55) 0%, rgba(58,36,12,.78) 45%, rgba(24,16,8,.95) 100%)",
  script: "Good Food Happy People",
  h1: ["Restaurant", "Business", "Made Smarter"],
  sub: "Manage orders, tables, menu, staff and grow your restaurant with AI.",
  feats: [
    [QrCode, "Online Orders & Reservations", "Dine-in, takeaway & delivery"], [Receipt, "POS & Billing", "Fast & GST ready"],
    [LayoutGrid, "Table Management", "Real-time availability"], [Heart, "Customer CRM", "Loyalty & feedback"],
    [Package, "Menu & Inventory", "Track ingredients"], [Megaphone, "Marketing Tools", "Promotions & campaigns"],
  ],
  quote: "Miracurl Suite made it easy to manage our restaurant. Online orders and table bookings in one place!",
  who: ["Ranjit Debnath", "The Urban Kitchen, Bangalore"],
  foot: "Same Passion Bigger Possibilities ♡",
};

export function SignupHeroPanel({ resto = false }) {
  const d = resto ? RESTO : SALON;
  const dark = resto;
  const text = dark ? "text-white" : "text-slate-900";
  const sub = dark ? "text-white/75" : "text-slate-600";
  const accent = dark ? "text-[#f0c15a]" : "text-[#e0397a]";
  const iconBg = dark ? "bg-[#f0c15a]/15 text-[#f0c15a]" : "bg-[#e0397a]/10 text-[#e0397a]";
  return (
    <aside className="relative overflow-hidden rounded-[28px] min-h-[560px] lg:min-h-full shadow-[0_30px_80px_-30px_rgba(0,0,0,.35)]" data-testid={`signup-hero-${resto ? "restaurant" : "salon"}`}>
      <img src={d.img} alt="" className="absolute inset-0 w-full h-full object-cover" loading="eager" />
      <div className="absolute inset-0" style={{ background: d.wash }} />
      <div className="relative h-full flex flex-col p-7 sm:p-9">
        <div className={`font-playfair italic text-2xl leading-tight ${accent} -rotate-6 origin-left`}>{d.script.split(" ").slice(0, 2).join(" ")}<br />{d.script.split(" ").slice(2).join(" ")}</div>
        <div className="mt-auto pt-40 lg:pt-56">
          <h1 className={`font-playfair text-4xl sm:text-5xl leading-[1.02] ${text}`}>
            {d.h1[0]}<br />{d.h1[1]}<br /><span className={accent}>{d.h1[2]}</span>
          </h1>
          <p className={`mt-4 text-sm sm:text-base max-w-sm ${sub}`}>{d.sub}</p>
          <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {d.feats.map(([Icon, t, s]) => (
              <li key={t} className="flex items-start gap-3">
                <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 ${iconBg}`}><Icon className="w-4 h-4" /></span>
                <span><span className={`block text-sm font-semibold ${text}`}>{t}</span><span className={`block text-xs ${sub}`}>{s}</span></span>
              </li>
            ))}
          </ul>
          <figure className={`mt-7 rounded-2xl p-4 ${dark ? "bg-black/35 border border-white/10" : "bg-white/85 border border-white shadow-sm"}`}>
            <blockquote className={`text-sm italic leading-relaxed ${text}`}>“{d.quote}”</blockquote>
            <div className="flex gap-0.5 mt-2 text-[#f0c15a]">{[1, 2, 3, 4, 5].map(i => <Star key={i} className="w-3.5 h-3.5 fill-current" />)}</div>
            <figcaption className={`mt-1.5 text-xs ${sub}`}><b className={text}>{d.who[0]}</b><br />{d.who[1]}</figcaption>
          </figure>
          <div className={`mt-5 font-playfair italic text-lg ${accent}`}>{d.foot}</div>
        </div>
      </div>
    </aside>
  );
}

export const TRUST_STRIP = [
  ["🚀", "Quick Setup", "Under 2 minutes"], ["🛡️", "Secure & Reliable", "Your data is safe"],
  ["🎧", "Dedicated Support", "We're here for you"], ["📈", "Built for Growth", "Scale effortlessly"],
];

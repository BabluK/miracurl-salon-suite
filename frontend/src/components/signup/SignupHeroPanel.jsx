import { Calendar, Users, Heart, Receipt, Package, Star, QrCode, LayoutGrid, Megaphone } from "lucide-react";

const SALON = {
  img: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=85",
  wash: "linear-gradient(180deg, rgba(255,214,232,.35) 0%, rgba(255,236,244,.78) 40%, rgba(255,250,252,.97) 100%)",
  script: "Good Hair Brighter You",
  h1: ["Beauty", "Business", "Made Smarter"],
  sub: "Manage bookings, staff, billing, customers and grow your salon with AI.",
  feats: [
    [Calendar, "Online Bookings", "24/7 booking page & calendar sync"], [Users, "Staff Management", "Attendance, roster & commissions"],
    [Heart, "Customer CRM", "Loyalty, reviews & WhatsApp"], [Receipt, "POS & Billing", "Fast thermal bills, GST ready"], [Package, "Inventory Management", "Products, vendors & low-stock alerts"],
  ],
  quote: "Our revenue grew 40% in 3 months. WhatsApp bookings and staff commissions are pure magic!",
  who: ["Priya Sharma", "Owner, Glow Unisex Salon & Spa, Bangalore"],
  foot: "More Beauty Stories Together ♡",
};
const RESTO = {
  img: "https://images.pexels.com/photos/16671750/pexels-photo-16671750.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=940",
  wash: "linear-gradient(180deg, rgba(20,12,4,.35) 0%, rgba(26,18,10,.78) 42%, rgba(14,8,3,.96) 100%)",
  script: "Good Food Happy People",
  h1: ["Restaurant", "Business", "Made Smarter"],
  sub: "Manage orders, tables, menu, staff and grow your restaurant with AI.",
  feats: [
    [QrCode, "Online Orders & Table QR", "Dine-in, takeaway & delivery"], [Receipt, "POS, KOT & Split Bills", "Lightning-fast, GST ready"],
    [LayoutGrid, "Live Table Management", "Floor plan & turnover"], [Heart, "Customer CRM", "Loyalty & campaigns"],
    [Package, "Menu & Inventory", "Recipes & ingredient control"], [Megaphone, "Marketing Tools", "WhatsApp promos & offers"],
  ],
  quote: "Billing time dropped by 50% and table turnover doubled during peak dinner hours. Essential for any eatery!",
  who: ["Ranjit Debnath", "Founder, The Urban Kitchen, Bangalore"],
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
    <aside key={resto ? "r" : "s"} className="relative overflow-hidden rounded-[28px] min-h-[560px] lg:min-h-full shadow-[0_30px_80px_-30px_rgba(0,0,0,.35)] animate-fade-up transition-[box-shadow] duration-500" data-testid={`signup-hero-${resto ? "restaurant" : "salon"}`}>
      <img src={d.img} alt="" className="absolute inset-0 w-full h-full object-cover" loading="eager" />
      <div className="absolute inset-0" style={{ background: d.wash }} />
      <div className="relative h-full flex flex-col p-7 sm:p-9">
        <div className={`text-3xl sm:text-4xl leading-[0.95] ${accent} -rotate-6 origin-left drop-shadow-sm`} style={{ fontFamily: "'Caveat', cursive", fontWeight: 600 }}>{d.script.split(" ").slice(0, 2).join(" ")}<br />{d.script.split(" ").slice(2).join(" ")}</div>
        <div className="mt-auto pt-40 lg:pt-56">
          <h1 className={`font-playfair text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.02] tracking-tight ${text}`}>
            {d.h1[0]}<br />{d.h1[1]}<br /><span className={`italic ${accent}`}>{d.h1[2]}</span>
          </h1>
          <p className={`mt-4 text-sm sm:text-base max-w-sm ${sub}`}>{d.sub}</p>
          <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {d.feats.map(([Icon, t, s], i) => (
              <li key={t} className="flex items-start gap-3 animate-fade-up" style={{ animationDelay: `${80 + i * 60}ms` }}>
                <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 ${iconBg}`}><Icon className="w-4 h-4" /></span>
                <span><span className={`block text-sm font-semibold ${text}`}>{t}</span><span className={`block text-xs ${sub}`}>{s}</span></span>
              </li>
            ))}
          </ul>
          <figure className={`mt-7 rounded-2xl p-4 backdrop-blur-md ${dark ? "bg-black/40 border border-amber-400/20 shadow-xl" : "bg-white/90 border border-pink-100 shadow-[0_14px_40px_-16px_rgba(224,57,122,.35)]"}`}>
            <blockquote className={`text-sm italic leading-relaxed ${text}`}>“{d.quote}”</blockquote>
            <div className="flex gap-0.5 mt-2 text-[#f0c15a]">{[1, 2, 3, 4, 5].map(i => <Star key={i} className="w-3.5 h-3.5 fill-current" />)}</div>
            <figcaption className={`mt-1.5 text-xs ${sub}`}><b className={text}>{d.who[0]}</b><br />{d.who[1]}</figcaption>
          </figure>
          <div className={`mt-5 text-2xl ${accent}`} style={{ fontFamily: "'Caveat', cursive", fontWeight: 600 }}>{d.foot}</div>
        </div>
      </div>
    </aside>
  );
}

export const TRUST_STRIP = [
  ["🚀", "Quick Setup", "Under 2 minutes"], ["🛡️", "Secure & Reliable", "Your data is safe"],
  ["🎧", "Dedicated Support", "We're here for you"], ["📈", "Built for Growth", "Scale effortlessly"],
];

import { Link } from "react-router-dom";
import { Gift, Crown, ArrowRight, Calendar, Sparkles, ShieldCheck, Users, Star, Palette } from "lucide-react";
import { GOLD_BTN } from "./LandingSections";

export function PromoCards({ s, slug }) {
  const gift = s.gift_cards_enabled !== false && s.business_type !== "restaurant";
  const mem = s.membership;
  if (!gift && !mem) return null;
  return (
    <section className={`max-w-6xl mx-auto px-5 sm:px-8 py-8 grid gap-4 ${gift && mem ? "md:grid-cols-2" : ""}`} data-testid="salon-promo-cards">
      {gift && (
        <div className="relative overflow-hidden rounded-2xl border border-pink-400/20 bg-[radial-gradient(circle_at_20%_30%,rgba(236,72,153,.35),transparent_55%),linear-gradient(135deg,#1a0a14,#0b0b0f)] p-6 flex items-center gap-5">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#1b1b1f] to-black border border-gold/40 flex items-center justify-center shadow-[0_20px_40px_-20px_rgba(232,197,106,.6)] shrink-0"><Gift className="w-12 h-12 text-gold" strokeWidth={1.2} /></div>
          <div>
            <h3 className="font-playfair text-2xl text-white">Gift Card</h3>
            <p className="text-sm text-white/60 mt-1">The perfect gift for your loved ones — birthday, anniversary &amp; more.</p>
            <Link to={`/gift/${slug}`} data-testid="salon-gift-card-btn" className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-500 text-white text-xs font-bold hover:bg-pink-400">Buy Gift Card <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </div>
      )}
      {mem && (
        <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-[radial-gradient(circle_at_80%_20%,rgba(232,197,106,.28),transparent_55%),linear-gradient(135deg,#17120a,#0b0b0f)] p-6 flex items-center gap-5">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#1b1b1f] to-black border border-gold/40 flex items-center justify-center shrink-0"><Crown className="w-12 h-12 text-gold" strokeWidth={1.2} /></div>
          <div className="flex-1">
            <h3 className="font-playfair text-2xl text-white">Premium Membership</h3>
            <p className="text-sm text-white/60 mt-1">Exclusive benefits, priority booking &amp; more with {mem.name}.</p>
            <Link to={`/membership/${slug}`} data-testid="salon-membership-btn" className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-xs font-bold hover:brightness-110">View Plans <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          {(mem.cashback_pct || mem.discount_pct) ? <div className="absolute right-4 bottom-4 w-14 h-14 rounded-full bg-gold text-[#1a1408] text-[10px] font-bold flex items-center justify-center text-center leading-tight">{mem.cashback_pct ? `${mem.cashback_pct}% Cashback` : `${mem.discount_pct}% Off`}</div> : null}
        </div>
      )}
    </section>
  );
}

export function TrendingShades({ s, slug }) {
  if (!s.shades?.length) return null;
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8 py-6" data-testid="salon-trending-shades">
      <div className="flex items-end justify-between gap-4 mb-4">
        <h2 className="font-playfair text-2xl sm:text-3xl text-white flex items-center gap-2"><Palette className="w-6 h-6 text-gold" strokeWidth={1.4} /> Trending Shades This Season</h2>
        <Link to={`/color/${slug}`} className="text-xs text-gold inline-flex items-center gap-1 hover:underline">See All Colours <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {s.shades.map(c => (
          <Link key={c.id} to={`/color/${slug}`} data-testid={`salon-shade-${c.id}`} className="group rounded-2xl overflow-hidden border border-white/10 hover:border-gold/60 transition-colors">
            <div className="aspect-[4/5] overflow-hidden"><img src={`${process.env.REACT_APP_BACKEND_URL}${c.image_url}`} alt={c.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>
            <div className="py-2 text-center text-xs text-white/85">{c.name}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function TransformCTA({ s, bookHref }) {
  const resto = s.business_type === "restaurant";
  const bg = s.gallery?.[0] ? `${process.env.REACT_APP_BACKEND_URL}${s.gallery[0]}` : (s.hero_image || "");
  const bullets = resto ? [[Calendar, "Quick Reservation"], [Sparkles, "Expert Chefs"], [ShieldCheck, "Safe & Hygienic"], [Users, "Great Experience"]]
    : [[Calendar, "Quick Booking"], [Sparkles, "Expert Stylists"], [ShieldCheck, "Safe & Hygienic"], [Users, "Great Experience"]];
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8 py-8" data-testid="salon-transform-cta">
      <div className="relative overflow-hidden rounded-3xl border border-gold/25">
        {bg && <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0f]/40 via-[#0b0b0f]/90 to-[#0b0b0f]" />
        <div className={`relative grid gap-6 items-center p-7 sm:p-10 min-h-[220px] ${bg ? "lg:grid-cols-[1fr_1.2fr_.7fr]" : "lg:grid-cols-[1.4fr_.7fr]"}`}>
          {bg && <div className="hidden lg:block" />}
          <div>
            <h2 className="font-playfair text-2xl sm:text-3xl text-white">Ready for Your {resto ? "Table" : "Transformation"}?</h2>
            <p className="text-sm text-white/65 mt-2">{resto ? "Reserve now and let our chefs take care of the rest." : "Book your appointment now and let our experts bring out the best version of you."}</p>
            <Link to={bookHref} data-testid="salon-footer-book-btn" className={`${GOLD_BTN} mt-5`}><Calendar className="w-4 h-4" /> {resto ? "Reserve Your Table" : "Book Your Slot"} <ArrowRight className="w-4 h-4" /></Link>
          </div>
          <ul className="space-y-3 text-sm text-white/85">{bullets.map(([Icon, l]) => <li key={l} className="flex items-center gap-3"><Icon className="w-5 h-5 text-gold" strokeWidth={1.5} /> {l}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}

export function ReviewsGrid({ reviews }) {
  if (!reviews?.length) return null;
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8 py-6" data-testid="salon-reviews">
      <h2 className="font-playfair text-2xl sm:text-3xl text-white mb-4">What Clients Say</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {reviews.slice(0, 6).map((r, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-gold/40 transition-colors">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-white">{r.customer_name || "Client"}</span><span className="text-xs text-gold inline-flex items-center gap-1"><Star className="w-3 h-3 fill-current" /> {r.rating}</span></div>
            <p className="text-xs text-white/60 italic mt-2 leading-relaxed">“{r.comment}”</p>
          </div>
        ))}
      </div>
    </section>
  );
}

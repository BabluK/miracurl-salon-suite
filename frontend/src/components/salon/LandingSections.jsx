import { Link } from "react-router-dom";
import { Calendar, Sparkles, MapPin, Clock, Phone, Users, ShieldCheck, Gem, Smile, ArrowRight, Star, Heart, MoreHorizontal, Instagram, Facebook, Youtube } from "lucide-react";
import { catImage } from "@/lib/categoryImages";
import { serviceIcon } from "@/lib/serviceIcon";

const fmt12 = (v, d) => { const [h, m] = (v || d).split(":").map(Number); return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
export const openChat = () => window.dispatchEvent(new CustomEvent("miracurl:open-chat", { detail: { tab: "ai" } }));
export const GOLD_BTN = "inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] font-bold text-sm shadow-[0_12px_30px_-12px_rgba(232,197,106,.8)] hover:brightness-110 transition-[filter,transform] hover:-translate-y-0.5";
const TILE_CLS = "group w-full rounded-2xl border border-gold/20 bg-gradient-to-b from-white/[0.05] to-transparent p-4 text-center hover:border-gold/60 hover:-translate-y-1 transition-[transform,border-color] duration-300";
export const GHOST_BTN = "inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-gold/40 bg-white/[0.04] text-white text-sm font-semibold hover:border-gold hover:bg-white/[0.08] transition-colors";

export function SalonHero({ s, bookHref, cats }) {
  const resto = s.business_type === "restaurant";
  const img = s.hero_image || s.gallery?.[0] || catImage(cats[0] || "Hair", {});
  const src = img.startsWith("/") ? `${process.env.REACT_APP_BACKEND_URL}${img}` : img;
  const usps = resto
    ? [[Users, "Expert Chefs"], [ShieldCheck, "Hygienic & Safe"], [Gem, "Fresh Ingredients"], [Smile, "Warm Hospitality"]]
    : [[Users, "Expert Stylists"], [ShieldCheck, "Hygienic & Safe"], [Gem, "Premium Products"], [Smile, "Relaxing Experience"]];
  return (
    <section className="relative pt-14 overflow-hidden" data-testid="salon-hero">
      <div className="absolute inset-0">
        <img src={src} alt="" className="w-full h-full object-cover object-right opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#080809] via-[#080809]/90 to-[#080809]/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080809] via-transparent to-transparent" />
      </div>
      <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-20 grid lg:grid-cols-[1.1fr_.9fr] gap-8 items-center">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-gold/80">{resto ? "Flavour begins here" : "Beauty begins here"}</div>
          <h1 data-testid="salon-name" className="mt-3 font-playfair text-4xl sm:text-5xl lg:text-6xl leading-[1.05] text-white">
            {resto ? <>Where Flavour<br />Meets <em className="text-gold not-italic font-playfair italic">Every Table</em></> : <>Where Elegance<br />Meets <em className="text-gold font-playfair italic">Every Strand</em></>}
          </h1>
          <p className="mt-4 text-white/70 text-base max-w-md">{cats.slice(0, 5).join(". ")}. All in one place.</p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/75">
            {usps.map(([Icon, l]) => <span key={l} className="inline-flex items-center gap-1.5"><Icon className="w-4 h-4 text-gold" strokeWidth={1.6} /> {l}</span>)}
          </div>
          <div className="mt-6 inline-grid grid-cols-1 sm:grid-cols-3 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur divide-y sm:divide-y-0 sm:divide-x divide-white/10 text-xs" data-testid="salon-info-strip">
            <a href={s.maps_url || "#"} target={s.maps_url ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04]">
              <MapPin className="w-5 h-5 text-gold" strokeWidth={1.6} /><span><span className="block text-white font-medium">{s.location || "Visit us"}</span><span className="text-white/45">{s.maps_url ? "View on map" : ""}</span></span></a>
            <span className="flex items-center gap-3 px-4 py-3"><Clock className="w-5 h-5 text-gold" strokeWidth={1.6} /><span><span className="block text-white font-medium">Mon – Sun</span><span className="text-white/45">{fmt12(s.open_time, "10:00")} – {fmt12(s.close_time, "21:00")}</span></span></span>
            <a href={s.phone ? `tel:${s.phone}` : "#"} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04]"><Phone className="w-5 h-5 text-gold" strokeWidth={1.6} /><span><span className="block text-white font-medium">Call Us</span><span className="text-white/45">{s.phone || "—"}</span></span></a>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={bookHref} data-testid="salon-book-now-btn" className={GOLD_BTN}><Calendar className="w-4 h-4" /> {resto ? "Reserve a Table" : "Book Appointment"} <ArrowRight className="w-4 h-4" /></Link>
            <button type="button" data-testid="salon-talk-to-mira-btn" onClick={openChat} className={GHOST_BTN}><Sparkles className="w-4 h-4 text-gold" /> Let Mira AI Book for You <span className="text-[9px] px-1.5 py-0.5 rounded bg-gold text-[#1a1408] font-bold">AI</span></button>
          </div>
        </div>
        <div className="relative hidden lg:block h-[420px]">
          <div className="absolute top-2 right-4 w-28 h-28 rounded-full bg-[#0f0d0a]/85 border border-gold/40 flex items-center justify-center text-center text-[11px] text-white leading-snug p-4 shadow-[0_0_40px_-10px_rgba(232,197,106,.6)]">{resto ? "Taste Good\nFeel Amazing\nEveryday" : "Look Good\nFeel Amazing\nEveryday"}</div>
          <div className="absolute bottom-8 right-8 font-playfair italic text-gold text-2xl rotate-[-8deg] select-none">{resto ? "Flavour Speaks ♡" : `${cats[0] || "Beauty"} Speaks Style ♡`}</div>
        </div>
      </div>
    </section>
  );
}

export function SignatureServices({ s, cats, bookHref, onCategory }) {
  const tiles = cats.slice(0, 7);
  const Tile = ({ cat, children, testid }) => onCategory
    ? <button type="button" data-testid={testid} onClick={() => onCategory(cat)} className={TILE_CLS}>{children}</button>
    : <Link to={bookHref} data-testid={testid} className={TILE_CLS}>{children}</Link>;
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10" data-testid="salon-signature-services">
      <div className="flex items-end justify-between gap-4 mb-5">
        <h2 className="font-playfair text-2xl sm:text-3xl text-white flex items-center gap-3">{s.business_type === "restaurant" ? "Our Signature Dishes" : "Our Signature Services"} <span className="hidden sm:block w-16 h-px bg-gold/60" /></h2>
        {onCategory
          ? <button type="button" onClick={() => onCategory("All")} className="text-xs text-gold inline-flex items-center gap-1 hover:underline">View All {s.business_type === "restaurant" ? "Dishes" : "Services"} <ArrowRight className="w-3.5 h-3.5" /></button>
          : <Link to={bookHref} className="text-xs text-gold inline-flex items-center gap-1 hover:underline">View All {s.business_type === "restaurant" ? "Dishes" : "Services"} <ArrowRight className="w-3.5 h-3.5" /></Link>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {tiles.map(c => {
          const Icon = serviceIcon({ name: c, category: c }) || Sparkles;
          return (
            <Tile key={c} cat={c} testid={`salon-cat-${c.replace(/\s+/g, "-").toLowerCase()}`}>
              <Icon className="w-9 h-9 mx-auto text-gold" strokeWidth={1.2} />
              <div className="mt-3 text-xs text-white/90 leading-snug">{c}</div>
            </Tile>
          );
        })}
        <Tile cat="All" testid="salon-cat-more">
          <MoreHorizontal className="w-9 h-9 mx-auto text-gold" strokeWidth={1.2} />
          <div className="mt-3 text-xs text-white/90 leading-snug">More<br />{s.business_type === "restaurant" ? "Dishes" : "Services"}</div>
        </Tile>
      </div>
    </section>
  );
}

export function TrustStrip({ s }) {
  const items = [
    [Star, s.avg_rating != null ? `${s.avg_rating} ★` : "New", `${s.reviews_count || 0} reviews`],
    [Users, `${Math.max(s.customers_count || 0, 0).toLocaleString("en-IN")}+`, "Happy Customers"],
    [Gem, s.business_type === "restaurant" ? "Fresh Daily" : "Premium Brands", "You Can Trust"],
    [ShieldCheck, "Hygienic & Safe", "Your Safety First"],
  ];
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-8" data-testid="salon-trust-strip">
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-2xl border border-white/10 bg-white/[0.03] divide-x divide-y lg:divide-y-0 divide-white/10">
        {items.map(([Icon, v, l]) => (
          <div key={l} className="flex items-center gap-3 px-5 py-4"><Icon className="w-7 h-7 text-gold" strokeWidth={1.4} /><div><div className="text-white font-semibold text-sm">{v}</div><div className="text-[11px] text-white/45">{l}</div></div></div>
        ))}
      </div>
    </section>
  );
}

export function FooterStrip({ s }) {
  const socials = [["instagram_url", "Instagram", Instagram], ["facebook_url", "Facebook", Facebook], ["youtube_url", "YouTube", Youtube]].filter(([k]) => s[k]);
  const locations = 1 + (s.branches?.length || 0);
  return (
    <footer className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-wrap items-center gap-6 justify-between" data-testid="salon-footer">
      <div className="font-playfair italic text-gold text-xl leading-tight rotate-[-4deg]">More Than A {s.business_type === "restaurant" ? "Restaurant" : "Salon"}<br /><span className="ml-4">A Place You&apos;ll Love <Heart className="inline w-4 h-4" /></span></div>
      <div className="flex flex-wrap gap-6 text-sm">
        <span className="flex items-center gap-2"><Users className="w-6 h-6 text-gold" strokeWidth={1.4} /><span><b className="text-white">{(s.customers_count || 0).toLocaleString("en-IN")}+</b><br /><span className="text-white/45 text-xs">Happy Clients</span></span></span>
        <span className="flex items-center gap-2"><Star className="w-6 h-6 text-gold" strokeWidth={1.4} /><span><b className="text-white">{s.avg_rating ?? "New"} ★</b><br /><span className="text-white/45 text-xs">Google Reviews</span></span></span>
        <span className="flex items-center gap-2"><MapPin className="w-6 h-6 text-gold" strokeWidth={1.4} /><span><b className="text-white">{locations} Location{locations > 1 ? "s" : ""}</b><br /><span className="text-white/45 text-xs truncate max-w-[220px] inline-block">{[s.location, ...(s.branches || [])].filter(Boolean).join(" | ")}</span></span></span>
      </div>
      {socials.length > 0 && (
        <div className="text-xs text-white/60">Follow Us
          <div className="flex gap-2 mt-2">{socials.map(([k, l, Icon]) => <a key={k} href={s[k]} target="_blank" rel="noreferrer" title={l} data-testid={`salon-social-${l.toLowerCase()}`} className="w-9 h-9 rounded-lg border border-gold/40 flex items-center justify-center text-gold hover:bg-gold hover:text-black transition-colors"><Icon className="w-4 h-4" strokeWidth={1.6} /></a>)}</div>
        </div>
      )}
    </footer>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Menu, X, MapPin, Phone, Clock, Instagram, Facebook, Youtube, MessageCircle, Gift, CreditCard, Palette, Star, ArrowRight, Heart } from "lucide-react";

const NAV = [["Home", "#home"], ["Services", "#services"], ["Offers", "#offers"], ["Gallery", "#gallery"], ["About", "#about"], ["Contact", "#contact"]];
const scrollTo = (hash) => (e) => { e.preventDefault(); document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

export function SalonNavbar({ s, bookHref, resto }) {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const items = NAV.filter(([l, h]) => !(h === "#gallery" && !s.gallery?.length) && !(h === "#offers" && resto));
  return (
    <header className={`fixed top-0 inset-x-0 z-40 border-b transition-colors duration-300 ${solid ? "bg-[#080809]/95 border-gold/15 backdrop-blur-xl" : "bg-black/40 border-transparent backdrop-blur-md"}`} data-testid="salon-navbar">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <a href="#home" onClick={scrollTo("#home")} className="flex items-center gap-3 min-w-0" data-testid="salon-header-tenant-brand">
          {s.logo_url && <img src={s.logo_url} alt={s.name} className="w-11 h-11 rounded-xl object-contain bg-[#14141a] border border-gold/30 flex-shrink-0" />}
          <span className="min-w-0 leading-tight">
            <span className="block font-playfair text-sm sm:text-base gold-shine-text truncate">{s.name}</span>
            <span className="block text-[8px] sm:text-[9px] uppercase tracking-[0.32em] text-white/45 truncate">{resto ? "Fine Dining · Powered by Mira AI" : "Luxury Salon · Powered by Mira AI"}</span>
          </span>
        </a>
        <nav className="hidden lg:flex items-center gap-7 text-[13px] text-white/75" data-testid="salon-nav">
          {items.map(([l, h]) => (
            <a key={h} href={h} onClick={scrollTo(h)} data-testid={`salon-nav-${l.toLowerCase()}`} className="relative py-1 hover:text-white transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-gold hover:after:w-full after:transition-[width] after:duration-300">{l}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to={bookHref} data-testid="salon-header-book-btn" className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-xs sm:text-sm font-bold hover:brightness-110 flex-shrink-0 shadow-[0_10px_24px_-10px_rgba(232,197,106,.9)]">
            <Calendar className="w-4 h-4" /> {resto ? "Reserve" : "Book Now"} <ArrowRight className="w-4 h-4 hidden sm:block" />
          </Link>
          <button type="button" onClick={() => setOpen(o => !o)} aria-label="Menu" data-testid="salon-nav-toggle" className="lg:hidden w-10 h-10 rounded-xl border border-white/15 text-white/80 flex items-center justify-center">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden border-t border-white/10 bg-[#080809]/95 backdrop-blur-xl px-5 py-3 grid grid-cols-2 gap-1 text-sm text-white/80" data-testid="salon-nav-mobile">
          {items.map(([l, h]) => <a key={h} href={h} onClick={(e) => { scrollTo(h)(e); setOpen(false); }} className="px-3 py-2.5 rounded-lg hover:bg-white/5">{l}</a>)}
        </nav>
      )}
    </header>
  );
}

const fmt12 = (v, d) => { const [h, m] = (v || d).split(":").map(Number); return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const Col = ({ title, children }) => <div><div className="text-[10px] uppercase tracking-[0.3em] text-gold/80 mb-4">{title}</div><div className="space-y-2.5 text-sm text-white/70">{children}</div></div>;
const FLink = ({ to, href, onClick, icon: Icon, children, testid }) => {
  const cls = "flex items-center gap-2.5 hover:text-gold transition-colors";
  const inner = <>{Icon && <Icon className="w-4 h-4 text-gold/70" strokeWidth={1.6} />}<span>{children}</span></>;
  if (to) return <Link to={to} className={cls} data-testid={testid}>{inner}</Link>;
  return <a href={href || "#"} onClick={onClick} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={cls} data-testid={testid}>{inner}</a>;
};

export function SalonFooter({ s, slug, bookHref, resto }) {
  const wa = s.whatsapp_number || (s.phone || "").replace(/\D/g, "");
  const socials = [["instagram_url", "Instagram", Instagram], ["facebook_url", "Facebook", Facebook], ["youtube_url", "YouTube", Youtube]].filter(([k]) => s[k]);
  const cats = [...new Set((s.services || []).map(x => x.category || "Services"))].slice(0, 6);
  return (
    <footer id="contact" className="relative mt-6 border-t border-gold/15 bg-[#050506] scroll-mt-20" data-testid="salon-footer-main">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 pb-8 grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-3">
            {s.logo_url && <img src={s.logo_url} alt="" className="w-12 h-12 rounded-xl object-contain bg-[#14141a] border border-gold/30" />}
            <div><div className="font-playfair text-lg text-white">{s.name}</div><div className="text-[9px] uppercase tracking-[0.3em] text-white/40">{resto ? "Fine Dining" : "Luxury Salon"} · Powered by Mira AI</div></div>
          </div>
          <p className="mt-4 text-sm text-white/55 leading-relaxed max-w-xs">{s.about || (resto ? "Fresh flavours, warm hospitality and a table that's always ready for you." : "Expert stylists, premium products and a relaxing experience — beauty that begins the moment you walk in.")}</p>
          <div className="mt-5 font-playfair italic text-gold text-lg leading-tight">More Than A {resto ? "Restaurant" : "Salon"} — A Place You&apos;ll Love <Heart className="inline w-4 h-4" /></div>
          {socials.length > 0 && (
            <div className="flex gap-2 mt-5">{socials.map(([k, l, Icon]) => <a key={k} href={s[k]} target="_blank" rel="noreferrer" title={l} data-testid={`salon-footer-social-${l.toLowerCase()}`} className="w-10 h-10 rounded-xl border border-gold/40 flex items-center justify-center text-gold hover:bg-gold hover:text-black transition-colors"><Icon className="w-4 h-4" strokeWidth={1.6} /></a>)}</div>
          )}
        </div>
        <Col title="Quick links">
          <FLink to={bookHref} icon={Calendar} testid="salon-footer-link-book">{resto ? "Reserve a table" : "Book appointment"}</FLink>
          <FLink href="#services" onClick={scrollTo("#services")} icon={Star}>Our {resto ? "dishes" : "services"}</FLink>
          {!resto && s.gift_cards_enabled !== false && <FLink to={`/gift/${slug}`} icon={Gift} testid="salon-footer-link-gift">Gift cards</FLink>}
          {s.membership && <FLink to={`/membership/${slug}`} icon={CreditCard} testid="salon-footer-link-membership">Premium membership</FLink>}
          {!resto && s.shades?.length > 0 && <FLink to={`/color/${slug}`} icon={Palette} testid="salon-footer-link-color">Hair colour try-on</FLink>}
          <FLink href="#about" onClick={scrollTo("#about")} icon={MessageCircle}>Client reviews</FLink>
        </Col>
        <Col title={resto ? "On the menu" : "Services"}>
          {cats.map(c => <FLink key={c} to={`${bookHref}`} testid={`salon-footer-cat-${c.replace(/\s+/g, "-").toLowerCase()}`}>{c}</FLink>)}
        </Col>
        <Col title="Contact">
          <FLink href={s.maps_url} icon={MapPin} testid="salon-footer-address">{[s.location, ...(s.branches || [])].filter(Boolean).join(" · ") || "Visit us"}</FLink>
          {s.phone && <FLink href={`tel:${s.phone.replace(/\s/g, "")}`} icon={Phone} testid="salon-footer-phone">{s.phone}</FLink>}
          {wa && <FLink href={`https://wa.me/${wa.length === 10 ? "91" + wa : wa}?text=${encodeURIComponent(`Hi ${s.name}! I found you on Miracurl ✨`)}`} icon={MessageCircle} testid="salon-footer-whatsapp">Chat on WhatsApp</FLink>}
          <div className="flex items-center gap-2.5"><Clock className="w-4 h-4 text-gold/70" strokeWidth={1.6} /><span>Mon – Sun · {fmt12(s.open_time, "10:00")} – {fmt12(s.close_time, "21:00")}</span></div>
          <Link to={bookHref} className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-xs font-bold hover:brightness-110" data-testid="salon-footer-book-cta">
            <Calendar className="w-4 h-4" /> {resto ? "Reserve now" : "Book now"}
          </Link>
        </Col>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-white/40">
          <span>© {new Date().getFullYear()} {s.name}. All rights reserved.</span>
          <span className="flex items-center gap-3">
            <a href="/terms" className="hover:text-gold">Terms</a><a href="/privacy" className="hover:text-gold">Privacy</a>
            <a href={`/success-stories?ref=${slug}`} target="_blank" rel="noreferrer" data-testid="powered-by-miracurl-link" className="text-gold/80 hover:text-gold">Powered by Miracurl {resto ? "Restaurant" : "Salon"} Suite ✦</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

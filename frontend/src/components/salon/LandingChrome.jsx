import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Menu, X, MapPin, Phone, Clock, Instagram, Facebook, Youtube, MessageCircle, Gift, CreditCard, Palette, Star, ArrowRight, Heart, Sparkles, ChevronDown } from "lucide-react";

const NAV = [["Home", "#home"], ["About Us", "#about"], ["Services", "#services"], ["Our Work", "#gallery"], ["Offers", "#offers"], ["Contact", "#contact"]];
const scrollTo = (hash) => (e) => { e.preventDefault(); document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

export function SalonNavbar({ s, bookHref, resto }) {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const [branch, setBranch] = useState("");
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const items = NAV.filter(([l, h]) => !(h === "#gallery" && !s.gallery?.length) && !(h === "#offers" && resto));
  const branches = (s.branches || []).map(b => b.name).filter(Boolean);
  const area = (b) => (b || s.location || "").split(",")[0].split("-").pop().trim();
  const tagline = s.tagline || (resto ? "Taste · Warmth · For Everyone" : "Beauty · Care · For Everyone");
  const href = branch ? `${bookHref}${bookHref.includes("?") ? "&" : "?"}branch=${encodeURIComponent(branch)}` : bookHref;
  return (
    <header className="fixed top-0 inset-x-0 z-40 px-2 sm:px-4 pt-2 sm:pt-3" data-testid="salon-navbar">
      <div className={`max-w-[1500px] mx-auto rounded-b-[28px] sm:rounded-b-[36px] border border-[#d4af37]/40 bg-[#fffdf8]/95 backdrop-blur-xl text-[#1f1a10] transition-shadow duration-300 ${solid ? "shadow-[0_18px_50px_-20px_rgba(0,0,0,.6)]" : "shadow-[0_10px_40px_-18px_rgba(0,0,0,.45)]"}`}>
        <div className="px-4 sm:px-8 h-[72px] sm:h-[88px] flex items-center gap-4 sm:gap-6">
          <a href="#home" onClick={scrollTo("#home")} className="flex items-center gap-3 min-w-0" data-testid="salon-header-tenant-brand">
            {s.logo_url ? (
              <img src={s.logo_url} alt={s.name} className="h-12 sm:h-16 w-auto max-w-[170px] sm:max-w-[240px] object-contain flex-shrink-0" />
            ) : (
              <span className="leading-none">
                <span className="block font-caveat text-[#b8863b] text-3xl sm:text-[34px] leading-none whitespace-nowrap max-w-[300px] truncate">{s.name}</span>
                <span className="block text-[9px] tracking-[0.35em] uppercase text-[#7a6a45] mt-1">{resto ? "Restaurant" : "Unisex Salon"}</span>
              </span>
            )}
          </a>
          <div className="hidden xl:block h-12 w-px bg-[#d4af37]/40" />
          <div className="hidden xl:block leading-tight">
            <div className="text-[11px] tracking-[0.35em] uppercase text-[#5b4b2a] whitespace-nowrap">{tagline}</div>
            <div className="text-[12px] text-[#3c3222] mt-1.5 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#c99a2e]" /> Powered by Miracurl AI {resto ? "Restaurant" : "Salon"} Suite</div>
          </div>
          <nav className="hidden lg:flex items-center gap-6 xl:gap-7 text-[15px] text-[#2a2418] ml-auto" data-testid="salon-nav">
            {items.map(([l, h], i) => (
              <a key={h} href={h} onClick={scrollTo(h)} data-testid={`salon-nav-${l.toLowerCase().replace(/\s+/g, "-")}`} className={`relative py-1 font-medium hover:text-[#b8863b] transition-colors after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:bg-[#b8863b] after:transition-[width] after:duration-300 ${i === 0 ? "text-[#b8863b] after:w-full" : "after:w-0 hover:after:w-full"}`}>{l}</a>
            ))}
          </nav>
          <div className="hidden lg:block h-12 w-px bg-[#d4af37]/40" />
          {(branches.length > 0 || s.location) && (
            <label className="hidden md:flex items-center gap-2 h-12 px-4 rounded-full border border-[#d4af37]/50 bg-white text-[#2a2418] text-sm relative" data-testid="salon-branch-select-wrap">
              <MapPin className="w-4 h-4 text-[#b8863b]" />
              <select value={branch} onChange={e => setBranch(e.target.value)} data-testid="salon-branch-select" className="appearance-none bg-transparent pr-5 focus:outline-none cursor-pointer max-w-[160px] truncate text-[#2a2418] font-medium" style={{ color: "#2a2418" }}>
                <option value="" className="text-black">{area(s.location) || s.name}</option>
                {branches.map(b => <option key={b} value={b} className="text-black">{area(b) || b}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-[#7a6a45] absolute right-3 pointer-events-none" />
            </label>
          )}
          <div className="flex items-center gap-2 ml-auto lg:ml-0">
            <Link to={href} data-testid="salon-header-book-btn" className="inline-flex items-center gap-2 h-11 sm:h-12 px-4 sm:px-6 rounded-full bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-sm sm:text-base font-bold hover:brightness-110 flex-shrink-0 shadow-[0_12px_28px_-12px_rgba(201,154,46,.9)] border border-[#b8863b]/40">
              <Calendar className="w-4 h-4" /> <span className="hidden sm:inline">{resto ? "Reserve a Table" : "Book Appointment"}</span><span className="sm:hidden">{resto ? "Reserve" : "Book"}</span> <ArrowRight className="w-4 h-4" />
            </Link>
            <button type="button" onClick={() => setOpen(o => !o)} aria-label="Menu" data-testid="salon-nav-toggle" className="lg:hidden w-11 h-11 rounded-full border border-[#d4af37]/50 text-[#2a2418] flex items-center justify-center bg-white">
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="lg:hidden border-t border-[#d4af37]/30 px-5 py-3 grid grid-cols-2 gap-1 text-sm text-[#2a2418]" data-testid="salon-nav-mobile">
            {items.map(([l, h]) => <a key={h} href={h} onClick={(e) => { scrollTo(h)(e); setOpen(false); }} className="px-3 py-2.5 rounded-lg hover:bg-[#f6efe0]">{l}</a>)}
            {branches.length > 0 && (
              <select value={branch} onChange={e => setBranch(e.target.value)} className="col-span-2 mt-1 h-11 px-3 rounded-full border border-[#d4af37]/50 bg-white text-sm" data-testid="salon-branch-select-mobile">
                <option value="">{area(s.location) || s.name}</option>
                {branches.map(b => <option key={b} value={b}>{area(b) || b}</option>)}
              </select>
            )}
          </nav>
        )}
      </div>
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

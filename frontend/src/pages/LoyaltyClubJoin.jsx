import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Gift, Star, UtensilsCrossed, Wifi, MessageSquare, Gamepad2, Instagram, Tag, CalendarCheck, ChevronRight, X, Copy, Check } from "lucide-react";
import { WaitGames } from "@/components/order/WaitGames";
import { LoyaltyJoinForm } from "@/components/loyalty/LoyaltyJoinForm";

const API = process.env.REACT_APP_BACKEND_URL;

// Public "Rewards QR" landing — every guest touchpoint on one dark-marble, gold page (scanned from the loyalty poster).
export default function LoyaltyClubJoin() {
  const { slug } = useParams();
  const [salon, setSalon] = useState(null);
  const [panel, setPanel] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/public/salon/${slug}`).then(r => setSalon(r.data)).catch(() => setSalon({ name: "Rewards", missing: true }));
  }, [slug]);

  const resto = salon?.business_type === "restaurant";
  const links = useMemo(() => {
    if (!salon) return [];
    const L = [
      { key: "rewards", icon: Gift, title: "Start Earning Rewards", sub: "Join our loyalty club", gold: true, panel: "rewards" },
      { key: "review", icon: Star, title: "Leave a Google Review", sub: "Share your experience", href: salon.google_review_url || `/rate/${slug}`, ext: !!salon.google_review_url, google: true },
      { key: "menu", icon: UtensilsCrossed, title: resto ? "View Menu" : "Services & Prices", sub: resto ? "Explore our dishes & prices" : "Explore our services & prices", href: resto ? `/order/${slug}` : `/book/${slug}` },
      salon.wifi_ssid ? { key: "wifi", icon: Wifi, title: "Connect to Wi-Fi", sub: "Stay connected with us", panel: "wifi" } : null,
      { key: "feedback", icon: MessageSquare, title: "Leave Anonymous Feedback", sub: "Help us serve you better", href: `/rate/${slug}` },
      { key: "game", icon: Gamepad2, title: "Play a Game", sub: "Have fun while you wait", panel: "game" },
      salon.instagram_url ? { key: "insta", icon: Instagram, title: "Follow Us on Instagram", sub: "Get the latest updates", href: salon.instagram_url, ext: true, insta: true } : null,
      { key: "offers", icon: Tag, title: resto ? "Offers & Gift Cards" : "Offers & Packages", sub: "Exclusive deals for you", href: resto ? `/gift/${slug}` : `/membership/${slug}` },
      !resto ? { key: "book", icon: CalendarCheck, title: "Book an Appointment", sub: "Pick your stylist & time", href: `/book/${slug}` } : null,
    ];
    return L.filter(Boolean);
  }, [salon, slug, resto]);

  if (!salon) return <div className="min-h-screen bg-[#0d0b09]" />;

  const quotes = resto
    ? [["Good Food", "Brings People", "Together"], ["Taste", "The", "Moment"], ["Eat Well", "Live Well", "Love Well"]]
    : [["Good Hair", "Brighter", "Mood"], ["Look", "Good", "Feel", "Amazing"], ["Self", "Care", "Looks", "Good", "On You"]];
  return (
    <div className="min-h-screen bg-[#0a0806] text-white relative overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }} data-testid="loyalty-join-page">
      <img src={salon.hero_image || "/assets/login/bg-salon.jpg"} alt="" aria-hidden className="fixed inset-0 w-full h-full object-cover opacity-40 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(232,195,127,0.18),transparent_55%)] pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-b from-[#0a0806]/55 via-[#0a0806]/55 to-[#0a0806] pointer-events-none" />

      {/* side script quotes — like neon-gold wall lettering */}
      <SideQuote lines={quotes[0]} className="left-3 top-28" />
      <SideQuote lines={quotes[1]} className="right-3 top-10" />
      <SideQuote lines={quotes[2]} className="left-3 bottom-40" />

      <div className="relative max-w-[380px] mx-auto px-4 pt-9 pb-12">
        <header className="text-center" data-testid="rewards-hub-header">
          {salon.logo_url
            ? <img src={salon.logo_url} alt={salon.name} className="h-24 w-auto max-w-[260px] object-contain mx-auto drop-shadow-[0_2px_18px_rgba(232,195,127,0.45)]" data-testid="rewards-hub-logo" />
            : <h1 className="font-caveat text-[56px] leading-none text-transparent bg-clip-text bg-gradient-to-b from-[#f7e7b5] via-[#e8c37f] to-[#b8932e] drop-shadow-[0_2px_14px_rgba(232,195,127,0.35)]" data-testid="rewards-hub-name">{salon.name}</h1>}
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#e8c37f]" />
            <span className="font-playfair text-[13px] tracking-[0.35em] text-[#f3dfae]">{resto ? "RESTAURANT" : "UNISEX SALON"}</span>
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#e8c37f]" />
          </div>
          <p className="text-[#e8c37f] text-lg leading-none mt-1">❦</p>
          <p className="text-[10px] tracking-[0.32em] text-white/70 mt-1">{(salon.tagline || (resto ? "TASTE · WARMTH · FOR EVERYONE" : "BEAUTY · CARE · FOR EVERYONE")).toUpperCase()}</p>
        </header>

        <nav className="mt-7 space-y-3" data-testid="rewards-hub-links">
          {links.map((l, i) => <HubLink key={l.key} l={l} light={!l.gold && i % 2 === 1} onOpen={() => setPanel(l.panel)} />)}
        </nav>

        <div className="mt-8 flex items-center justify-center gap-2 text-left">
          <span className="text-[#e8c37f] text-2xl leading-none">✦</span>
          <span className="text-[11px] leading-tight text-white/80"><span className="block text-white/50">Powered by</span><b className="text-white">Miracurl AI {resto ? "Restaurant" : "Salon"} Suite</b></span>
        </div>
        <div className="flex items-center justify-center gap-3 mt-6">
          <span className="h-px w-14 bg-[#e8c37f]/50" />
          <p className="text-[9px] tracking-[0.3em] text-[#f3dfae]/80 whitespace-nowrap">{resto ? "MORE THAN A MEAL, IT'S HOSPITALITY" : "MORE THAN A SALON, IT'S FAMILY CARE"}</p>
          <span className="h-px w-14 bg-[#e8c37f]/50" />
        </div>
        <p className="text-center text-[#e8c37f] text-xl mt-3">♡</p>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => setPanel(null)} data-testid="rewards-hub-panel">
          <div className="w-full max-w-md rounded-3xl border border-amber-300/25 bg-gradient-to-b from-[#171310] to-[#100d0a] p-5 shadow-2xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPanel(null)} className="ml-auto flex w-8 h-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20" data-testid="rewards-hub-panel-close" aria-label="Close"><X className="w-4 h-4" /></button>
            {panel === "rewards" && <LoyaltyJoinForm slug={slug} />}
            {panel === "wifi" && <WifiPanel ssid={salon.wifi_ssid} password={salon.wifi_password} />}
            {panel === "game" && <WaitGames salon={salon} />}
          </div>
        </div>
      )}
    </div>
  );
}

function SideQuote({ lines, className }) {
  return (
    <div className={`hidden min-[430px]:block fixed ${className} font-caveat text-[#e8c37f]/80 text-xl leading-[1.05] pointer-events-none select-none drop-shadow-[0_0_10px_rgba(232,195,127,0.35)]`} aria-hidden>
      {lines.map(l => <div key={l}>{l}</div>)}
      <div className="mt-1 text-base">♡</div>
    </div>
  );
}

function HubLink({ l, light, onOpen }) {
  const Icon = l.icon;
  const cls = `group flex items-center gap-3.5 w-full rounded-full pl-2.5 pr-3 py-2 border shadow-[0_6px_24px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98] hover:translate-x-0.5 ${l.gold
    ? "bg-gradient-to-r from-[#f7e7b5] via-[#e8c37f] to-[#c9a24a] border-[#f3dfae] text-[#1a1206]"
    : light ? "bg-[#f7f4ee] border-[#e8c37f]/50 text-[#1a1206]" : "bg-[#151210]/90 border-[#e8c37f]/45 text-white backdrop-blur"}`;
  const iconCls = l.gold ? "bg-[#1a1206] text-[#e8c37f]"
    : l.google ? "bg-white border border-slate-200"
    : l.insta ? "bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white"
    : light ? "bg-[#1a1206] text-[#e8c37f] ring-2 ring-[#e8c37f]/60" : "bg-[#0a0806] text-[#e8c37f] ring-2 ring-[#e8c37f]/60";
  const inner = (
    <>
      <span className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${iconCls}`}>
        {l.google ? <GoogleG /> : <Icon className="w-5 h-5" />}
      </span>
      <span className="flex-1 text-left min-w-0">
        <span className="block font-semibold text-[15px] leading-tight">{l.title}</span>
        <span className={`block text-xs mt-0.5 ${l.gold || light ? "text-[#1a1206]/65" : "text-white/60"}`}>{l.sub}</span>
      </span>
      <ChevronRight className={`w-5 h-5 ${l.gold || light ? "text-[#1a1206]/60" : "text-white/70"} group-hover:translate-x-0.5 transition-transform`} />
    </>
  );
  if (l.panel) return <button onClick={onOpen} className={cls} data-testid={`hub-link-${l.key}`}>{inner}</button>;
  return <a href={l.href} target={l.ext ? "_blank" : undefined} rel={l.ext ? "noopener noreferrer" : undefined} className={cls} data-testid={`hub-link-${l.key}`}>{inner}</a>;
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.3 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v7.6h12.7c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7.2-10 7.2-16.7z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.6 14.6 0 0 1 9.7 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.8 2.4-8.5 2.4-6.3 0-11.6-3.8-13.5-9.2l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function WifiPanel({ ssid, password }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(password || ""); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } };
  return (
    <div className="text-center" data-testid="wifi-panel">
      <Wifi className="w-8 h-8 mx-auto text-amber-300" />
      <h2 className="font-playfair text-2xl text-amber-100 mt-2">Guest Wi-Fi</h2>
      <p className="text-xs text-white/50 mt-1">Open your Wi-Fi settings, pick the network and paste the password.</p>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
        <p className="text-[10px] tracking-widest text-white/40">NETWORK</p>
        <p className="text-base font-semibold" data-testid="wifi-ssid">{ssid}</p>
        {password && (<>
          <p className="text-[10px] tracking-widest text-white/40 mt-3">PASSWORD</p>
          <div className="flex items-center gap-2">
            <p className="text-base font-mono flex-1 break-all" data-testid="wifi-password">{password}</p>
            <button onClick={copy} className="px-3 py-1.5 rounded-full bg-amber-400 text-[#1a1206] text-xs font-bold flex items-center gap-1" data-testid="wifi-copy">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}

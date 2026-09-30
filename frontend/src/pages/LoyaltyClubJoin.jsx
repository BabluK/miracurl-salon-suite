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

  return (
    <div className="min-h-screen bg-[#0d0b09] text-white relative" style={{ fontFamily: "'Inter', sans-serif" }} data-testid="loyalty-join-page">
      <img src={salon.hero_image || "/assets/login/bg-salon.jpg"} alt="" aria-hidden className="fixed inset-0 w-full h-full object-cover opacity-30 pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-b from-[#0d0b09]/70 via-[#0d0b09]/60 to-[#0d0b09] pointer-events-none" />
      <div className="relative max-w-md mx-auto px-5 pt-10 pb-12">
        <header className="text-center">
          {salon.logo_url && <img src={salon.logo_url} alt="" className="w-16 h-16 rounded-full object-cover mx-auto mb-3 ring-2 ring-amber-300/40 bg-white" />}
          <h1 className="font-playfair text-4xl sm:text-5xl text-amber-200 leading-none" data-testid="rewards-hub-name">{salon.name}</h1>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="h-px w-10 bg-amber-300/50" /><span className="text-[11px] tracking-[0.35em] text-amber-100/90">{resto ? "RESTAURANT" : "UNISEX SALON"}</span><span className="h-px w-10 bg-amber-300/50" />
          </div>
          <p className="text-[10px] tracking-[0.3em] text-white/50 mt-2">{(salon.tagline || "").toUpperCase()}</p>
        </header>

        <nav className="mt-8 space-y-3" data-testid="rewards-hub-links">
          {links.map(l => <HubLink key={l.key} l={l} onOpen={() => setPanel(l.panel)} />)}
        </nav>

        <p className="text-center text-[11px] text-amber-200/70 mt-8">✦ Powered by <b className="text-amber-200">Miracurl AI {resto ? "Restaurant" : "Salon"} Suite</b></p>
        <p className="text-center text-[9px] tracking-[0.3em] text-white/30 mt-3">{resto ? "MORE THAN A MEAL, IT'S HOSPITALITY" : "MORE THAN A SALON, IT'S FAMILY CARE"}</p>
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

function HubLink({ l, onOpen }) {
  const Icon = l.icon;
  const cls = `group flex items-center gap-4 w-full rounded-full px-3 py-2.5 border transition-transform active:scale-[0.98] hover:translate-x-0.5 ${l.gold
    ? "bg-gradient-to-r from-amber-300 to-yellow-500 border-amber-200 text-[#1a1206]"
    : "bg-black/55 border-amber-300/25 text-white backdrop-blur"}`;
  const inner = (
    <>
      <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${l.gold ? "bg-[#1a1206] text-amber-300" : l.google ? "bg-white" : l.insta ? "bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white" : "bg-black/60 border border-amber-300/40 text-amber-300"}`}>
        {l.google ? <GoogleG /> : <Icon className="w-5 h-5" />}
      </span>
      <span className="flex-1 text-left min-w-0">
        <span className="block font-semibold text-[15px] leading-tight">{l.title}</span>
        <span className={`block text-xs mt-0.5 ${l.gold ? "text-[#1a1206]/70" : "text-white/55"}`}>{l.sub}</span>
      </span>
      <ChevronRight className={`w-5 h-5 mr-1 ${l.gold ? "text-[#1a1206]/70" : "text-white/60"} group-hover:translate-x-0.5 transition-transform`} />
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

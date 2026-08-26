import { Sparkles, ShieldCheck, Gift, ArrowRight, Play, MessageCircle, MapPin, Phone, Navigation } from "lucide-react";
import { thumbUrl } from "@/lib/api";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const openMira = (tab = "ai") =>
  window.dispatchEvent(new CustomEvent("miracurl:open-chat", { detail: { tab } }));

/* ---- Hero CTA pair: gold "book now" + glass AI button ---- */
export const HeroCTAs = ({ restaurant = false }) => (
  <div className="flex flex-wrap items-center gap-3 mt-6">
    <button
      data-testid="hero-book-now-btn"
      onClick={() => document.getElementById("booking-wizard")?.scrollIntoView({ behavior: "smooth" })}
      className="btn-gold flex items-center gap-2"
    >
      {restaurant ? "Reserve a Table" : "Book Appointment"} <ArrowRight className="w-4 h-4" />
    </button>
    <button
      data-testid="hero-ask-mira-btn"
      onClick={() => openMira("ai")}
      className="relative flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold hover:bg-white/20 hover:border-gold/60 hover:shadow-[0_0_24px_rgba(212,175,55,0.35)] transition-all duration-300"
    >
      <Sparkles className="w-4 h-4 text-gold animate-pulse" />
      Let Mira AI book for you
      <span className="text-[9px] uppercase tracking-widest bg-gold/20 border border-gold/40 text-gold px-1.5 py-0.5 rounded-full">AI</span>
    </button>
  </div>
);

/* ---- Gallery showcase (bento-ish scroll strip) ---- */
export const OffersShowcase = ({ items }) => {
  if (!items?.length) return null;
  return (
    <section className="mt-16" data-testid="offers-section">
      <div className="mb-5">
        <div className="text-[10px] tracking-[0.3em] uppercase text-gold">Limited Time</div>
        <h2 className="font-playfair text-2xl mt-1">Current offers ✨</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.slice(0, 6).map((g) => (
          <div key={g.id} data-testid="offer-flyer-item" className="relative rounded-2xl overflow-hidden border border-gold/30 group shadow-[0_0_30px_rgba(212,175,55,0.12)]">
            <img src={`${BACKEND_URL}${g.url}`} alt={g.caption || "Special offer"} loading="lazy"
              className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-500" />
            {(() => {
              if (!g.expires_on) return null;
              const dl = Math.round((new Date(g.expires_on) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
              if (dl < 0) return null;
              return (
                <span data-testid={`offer-countdown-${g.id}`}
                  className={`absolute top-3 left-0 px-3.5 py-1.5 rounded-r-full text-white text-xs font-bold shadow-lg ${dl <= 1 ? "bg-rose-600 animate-pulse" : "bg-rose-600/95"}`}>
                  {dl === 0 ? "⏳ Last day today!" : dl === 1 ? "⏳ Only 1 day left!" : `⏳ ${dl} days left!`}
                </span>
              );
            })()}
            <button onClick={() => openMira("ai")} data-testid={`offer-book-${g.id}`}
              className="absolute bottom-3 right-3 px-4 py-2 rounded-full bg-gold text-black text-xs font-bold shadow-lg hover:bg-gold/90 transition">
              Book this offer
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export const GalleryShowcase = ({ items }) => {
  if (!items?.length) return null;
  return (
    <section className="mt-16" data-testid="gallery-section">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-gold">Our Work</div>
          <h2 className="font-playfair text-2xl mt-1">Transformations we're proud of</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.slice(0, 8).map((g, i) => (
          <div
            key={g.id}
            data-testid="gallery-image-item"
            className={`relative rounded-xl overflow-hidden border border-white/10 group ${i === 0 ? "col-span-2 row-span-2" : ""}`}
          >
            {g.kind === "video" ? (
              <>
                <video src={`${BACKEND_URL}${g.url}`} className="w-full h-full object-cover aspect-square" muted playsInline loop autoPlay />
                <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 backdrop-blur flex items-center justify-center"><Play className="w-3 h-3 text-white" /></span>
              </>
            ) : (
              <img src={`${BACKEND_URL}${g.url}`} alt={g.caption || "Salon work"} loading="lazy" className="w-full h-full object-cover aspect-square group-hover:scale-105 transition-transform duration-500" />
            )}
            {g.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 text-[11px] text-white/85 opacity-0 group-hover:opacity-100 transition-opacity">
                {g.caption}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

/* ---- Verified team strip (links to public Staff Registry) ---- */
export const VerifiedTeam = ({ staff, restaurant = false }) => {
  if (!staff?.length) return null;
  return (
    <section className="mt-16" data-testid="verified-team-section">
      <div className="text-[10px] tracking-[0.3em] uppercase text-gold">Our Team</div>
      <h2 className="font-playfair text-2xl mt-1 mb-5">Talented hands, verified history</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {staff.map(s => (
          <div key={s.id} data-testid="verified-staff-card" className="min-w-[150px] bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-4 text-center hover:border-gold/40 transition-colors">
            <img src={thumbUrl(s.image_url, 160) || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"} alt={s.name} className="w-16 h-16 rounded-full object-cover mx-auto border-2 border-gold/50" loading="lazy" />
            <div className="font-playfair mt-2.5 text-sm">{s.name}</div>
            <div className="text-[10px] uppercase tracking-widest text-gold mt-0.5">{s.role}</div>
            <span className="inline-flex items-center gap-1 mt-2 text-[9px] uppercase tracking-wider bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3" /> Verified
            </span>
          </div>
        ))}
      </div>
      {!restaurant && (
        <a
          href="/staff-registry"
          target="_blank"
          rel="noreferrer"
          data-testid="verify-staff-registry-link"
          className="inline-flex items-center gap-2 mt-4 text-xs text-gold hover:text-gold-hover"
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Verify any stylist's employment history on the Staff Registry <ArrowRight className="w-3 h-3" />
        </a>
      )}
    </section>
  );
};

/* ---- Refer & Earn glass banner ---- */
export const ReferEarnBanner = ({ salonName, reward }) => {
  const share = () => {
    const msg = encodeURIComponent(
      `Hey! I love ${salonName || "this salon"} ✨ Book your appointment here and mention my referral code for a discount:\n${window.location.href}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
  };
  return (
    <section className="mt-16" data-testid="refer-earn-banner">
      <div className="relative overflow-hidden rounded-2xl backdrop-blur-xl bg-gold/10 border border-gold/30 p-6 sm:p-8">
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-gold/20 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-gold/20 border border-gold/40 flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6 text-gold" />
          </div>
          <div className="flex-1">
            <h3 className="font-playfair text-xl">Share the luxury. Get rewarded.</h3>
            <p className="text-sm text-white/60 mt-1">
              Have a friend's referral code? Enter it at checkout for instant credit{reward ? ` (₹${reward} for them too!)` : ""}. Already a client? Ask us for your personal code after your visit.
            </p>
          </div>
          <button
            data-testid="refer-share-btn"
            onClick={share}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gold text-bg-base text-sm font-semibold hover:bg-gold-hover transition"
          >
            <MessageCircle className="w-4 h-4" /> Share on WhatsApp
          </button>
        </div>
      </div>
    </section>
  );
};

/* ---- Our Locations (main + branches) ---- */
export const LocationsSection = ({ salon }) => {
  const branches = salon?.branches || [];
  const main = {
    id: "main",
    name: `${salon?.name || "Main Salon"}${branches.length ? " — Main Branch" : ""}`,
    address: salon?.location || "",
    phone: salon?.phone || "",
    maps_url: salon?.maps_url || "",
  };
  const all = [main, ...branches];
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 mt-4 mb-12" data-testid="locations-section">
      <div className="text-[10px] tracking-[0.3em] uppercase text-gold">Our Locations</div>
      <h2 className="font-playfair text-2xl mt-1 mb-5">Find us near you</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {all.map(b => {
          const mapsHref = b.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address}`)}`;
          return (
            <div key={b.id} className="bg-white/[0.045] backdrop-blur border border-white/10 rounded-2xl p-5 hover:border-gold/40 transition-colors" data-testid={`location-card-${b.id}`}>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-gold/10 border border-gold/25 flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-gold" /></span>
                <div className="font-playfair text-base leading-snug">{b.name}</div>
              </div>
              {b.address && <p className="text-xs text-ink-secondary mt-2.5 leading-relaxed">{b.address}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-3.5">
                {b.phone && (
                  <a href={`tel:${b.phone.replace(/\s/g, "")}`} data-testid={`location-call-${b.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-xs text-white/80 hover:border-gold/50 transition-colors">
                    <Phone className="w-3 h-3 text-gold" /> {b.phone}
                  </a>
                )}
                <a href={mapsHref} target="_blank" rel="noreferrer" data-testid={`location-directions-${b.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold/15 border border-gold/40 text-xs text-gold hover:bg-gold/25 transition-colors">
                  <Navigation className="w-3 h-3" /> Get Directions
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ---- "Powered by AI" trust strip ---- */
export const AITrustStrip = () => (
  <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white/45" data-testid="ai-trust-strip">
    <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-gold" /> AI assistant books for you 24/7</span>
    <span className="hidden sm:inline text-white/15">·</span>
    <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-gold" /> Registry-verified stylists</span>
    <span className="hidden sm:inline text-white/15">·</span>
    <span className="flex items-center gap-1.5"><Gift className="w-3.5 h-3.5 text-gold" /> Loyalty & referral rewards</span>
  </div>
);

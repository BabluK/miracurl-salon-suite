import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Scissors, Search, MapPin, ArrowRight, UtensilsCrossed } from "lucide-react";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import { SiteHeader } from "@/components/SiteHeader";
import SalesChatWidget from "@/components/SalesChatWidget";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function TenantCard({ s, restaurant }) {
  const logo = s.logo_url
    ? (s.logo_url.startsWith("/api/") ? `${BACKEND_URL}${s.logo_url}` : s.logo_url)
    : "";
  return (
    <Link
      to={`/book/${s.slug}`}
      data-testid={`salon-card-${s.slug}`}
      className="flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gold/40 rounded-2xl p-4 transition-colors group"
    >
      {logo ? (
        <span className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-br from-gold via-[#f3e3ae] to-[#b08d3f] flex-shrink-0">
          <span className="w-full h-full rounded-full overflow-hidden bg-[#14141a] block">
            <img src={logo} alt={s.name} className="w-full h-full object-cover scale-[1.45]" />
          </span>
        </span>
      ) : (
        <span className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-br from-gold via-[#f3e3ae] to-[#b08d3f] flex-shrink-0">
          <span className="w-full h-full rounded-full bg-[#17141c] text-gold flex items-center justify-center font-playfair text-xl font-bold">
            {(s.name || "M").charAt(0).toUpperCase()}
          </span>
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-playfair text-lg truncate">{s.name}</div>
        <div className="flex items-center gap-1 text-xs text-white/50 mt-0.5 truncate">
          <MapPin className="w-3 h-3 text-gold flex-shrink-0" /> {s.location || "India"}
        </div>
      </div>
      <span className="hidden sm:inline text-[9px] uppercase tracking-widest text-gold/70 border border-gold/30 rounded-full px-2 py-0.5 flex-shrink-0">
        {restaurant ? "Reserve" : "Book"}
      </span>
      <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-gold transition-colors flex-shrink-0" />
    </Link>
  );
}

function Section({ icon: Icon, title, sub, list, restaurant }) {
  if (!list.length) return null;
  return (
    <div className="mb-10" data-testid={restaurant ? "restaurant-finder-section" : "salon-finder-section"}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-full bg-gold flex items-center justify-center shadow-gold-glow flex-shrink-0">
          <Icon className="w-5 h-5 text-bg-base" />
        </div>
        <div>
          <div className="font-playfair text-2xl leading-none">{title}</div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-gold mt-1.5">{sub}</div>
        </div>
      </div>
      <div className="space-y-3">
        {list.map((s) => <TenantCard key={s.slug} s={s} restaurant={restaurant} />)}
      </div>
    </div>
  );
}

/**
 * Public directory for the "M" booking app — salons and restaurants listed
 * separately, each card wearing the tenant's own logo.
 */
export default function SalonFinder() {
  const PUBLIC = useMemo(() => axios.create({ baseURL: `${BACKEND_URL}/api/public` }), []);
  const [q, setQ] = useState("");
  const [tenants, setTenants] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      PUBLIC.get("/salons", { params: { q } })
        .then((r) => setTenants(r.data))
        .catch(() => setTenants([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, PUBLIC]);

  const salons = (tenants || []).filter((t) => t.business_type !== "restaurant");
  const restaurants = (tenants || []).filter((t) => t.business_type === "restaurant");

  return (
    <div className="min-h-screen mesh-dark text-white" data-testid="salon-finder-page">
      <SiteHeader variant="light" />
      <SalesChatWidget />
      <InstallAppPrompt />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-12 pb-24">
        <div className="relative mb-10">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search salons & restaurants by name or area…"
            autoFocus
            data-testid="salon-search-input"
            className="w-full bg-white/5 border border-white/10 focus:border-gold/50 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors"
          />
        </div>

        {tenants === null && (
          <div className="text-white/40 text-sm text-center py-10 animate-pulse">Loading…</div>
        )}

        {tenants?.length === 0 && (
          <div className="text-center py-10" data-testid="salon-finder-empty">
            <div className="text-white/60 text-sm">Nothing matches &quot;{q}&quot;</div>
            <div className="text-white/30 text-xs mt-1">Try a different name or area</div>
          </div>
        )}

        <Section icon={Scissors} title="Find your salon" sub="Book in seconds" list={salons} restaurant={false} />
        <Section icon={UtensilsCrossed} title="Find your restaurant" sub="Reserve · Order · Dine" list={restaurants} restaurant />
      </div>
    </div>
  );
}

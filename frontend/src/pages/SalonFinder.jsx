import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Scissors, Search, MapPin, ArrowRight } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Public salon directory for the "M" booking app.
 * Search any salon on the platform → tapping a result opens its booking page,
 * where the interface morphs to that tenant's branding (white-label).
 */
export default function SalonFinder() {
  const PUBLIC = useMemo(() => axios.create({ baseURL: `${BACKEND_URL}/api/public` }), []);
  const [q, setQ] = useState("");
  const [salons, setSalons] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      PUBLIC.get("/salons", { params: { q } })
        .then((r) => setSalons(r.data))
        .catch(() => setSalons([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, PUBLIC]);

  return (
    <div className="min-h-screen mesh-dark text-white" data-testid="salon-finder-page">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-16 pb-24">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-11 h-11 rounded-full bg-gold flex items-center justify-center shadow-gold-glow flex-shrink-0">
            <Scissors className="w-5 h-5 text-bg-base" />
          </div>
          <div>
            <div className="font-playfair text-2xl leading-none">Find your salon</div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gold mt-1.5">Book in seconds</div>
          </div>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by salon name or area…"
            autoFocus
            data-testid="salon-search-input"
            className="w-full bg-white/5 border border-white/10 focus:border-gold/50 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors"
          />
        </div>

        {salons === null && (
          <div className="text-white/40 text-sm text-center py-10 animate-pulse">Loading salons…</div>
        )}

        {salons?.length === 0 && (
          <div className="text-center py-10" data-testid="salon-finder-empty">
            <div className="text-white/60 text-sm">No salons match &quot;{q}&quot;</div>
            <div className="text-white/30 text-xs mt-1">Try a different name or area</div>
          </div>
        )}

        <div className="space-y-3">
          {salons?.map((s) => (
            <Link
              key={s.slug}
              to={`/book/${s.slug}`}
              data-testid={`salon-card-${s.slug}`}
              className="flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gold/40 rounded-2xl p-4 transition-colors group"
            >
              <img
                src={s.hero_image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200"}
                alt=""
                className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-white/10"
              />
              <div className="flex-1 min-w-0">
                <div className="font-playfair text-lg truncate">{s.name}</div>
                <div className="flex items-center gap-1 text-xs text-white/50 mt-0.5 truncate">
                  <MapPin className="w-3 h-3 text-gold flex-shrink-0" /> {s.location || "India"}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-gold transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

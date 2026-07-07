import { Star, MapPin } from "lucide-react";

// Shared public partner-card grid (Landing section + /partners page). Dark luxe theme.
export function PartnerGrid({ partners, compact = false }) {
  if (!partners?.length) return null;
  const list = compact ? partners.slice(0, 8) : partners;
  return (
    <div className={`grid gap-4 ${compact ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
      {list.map(p => (
        <div key={`${p.source}-${p.id}`} data-testid={`partner-card-${p.id}`}
          className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 hover:bg-white/[0.07] transition-colors">
          <div className="flex items-center gap-3">
            {p.logo_url ? (
              <img src={p.logo_url} alt={p.name} className="w-11 h-11 rounded-xl object-cover border border-white/10" />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400/30 to-fuchsia-500/30 border border-white/10 flex items-center justify-center text-amber-300 font-semibold">
                {(p.name || "?").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{p.name}</div>
              <div className="text-[11px] text-white/40 flex items-center gap-1 truncate">
                {p.city && <><MapPin className="w-3 h-3 flex-shrink-0" /> {p.city}</>}
              </div>
            </div>
            {p.featured && <Star className="w-4 h-4 text-amber-300 fill-amber-300 ml-auto flex-shrink-0" />}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {p.rating != null ? (
              <>
                <span className="inline-flex items-center gap-1 text-amber-300 text-sm font-semibold">
                  <Star className="w-3.5 h-3.5 fill-amber-300" /> {p.rating}
                </span>
                {p.reviews_count > 0 && <span className="text-[11px] text-white/40">{p.reviews_count} customer review{p.reviews_count > 1 ? "s" : ""}</span>}
              </>
            ) : (
              <span className="text-[11px] text-white/30">Newly onboarded</span>
            )}
          </div>
          {p.owner_review?.rating && (
            <div className="mt-3 border-l-2 border-emerald-400/40 pl-3" data-testid={`owner-review-${p.id}`}>
              <span className="inline-flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={`s${s}`} className={`w-3 h-3 ${p.owner_review.rating >= s ? "text-emerald-300 fill-emerald-300" : "text-white/15"}`} />
                ))}
                <span className="text-[10px] text-white/40 ml-1.5">owner on Miracurl</span>
              </span>
              {!compact && p.owner_review.text && (
                <p className="text-xs text-white/60 leading-relaxed mt-1.5">"{p.owner_review.text}"</p>
              )}
            </div>
          )}
          {!compact && p.blurb && (
            <p className="text-xs text-white/60 leading-relaxed mt-3 border-l-2 border-amber-400/40 pl-3">"{p.blurb}"</p>
          )}
        </div>
      ))}
    </div>
  );
}

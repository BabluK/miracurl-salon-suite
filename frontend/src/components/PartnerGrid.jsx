import { Star, MapPin } from "lucide-react";

// Shared public partner-card grid (Landing section + /partners page).
export function PartnerGrid({ partners, compact = false, light = false }) {
  if (!partners?.length) return null;
  const list = compact ? partners.slice(0, 8) : partners;
  const C = light ? {
    card: "bg-white border border-[#D9B878]/40 hover:border-[#C89B52]/70 hover:shadow-[0_18px_40px_-18px_rgba(184,134,59,0.35)]",
    logoBorder: "border-[#D9B878]/40",
    mono: "bg-gradient-to-br from-[#F0D9A5]/70 to-[#C89B52]/40 border-[#D9B878]/50 text-[#8a6420]",
    name: "text-[#2b2115]",
    muted: "text-[#8b7a5e]",
    faint: "text-[#a89877]",
    star: "text-[#b8863b]",
    starFill: "fill-[#b8863b]",
    ownerStar: "text-emerald-600 fill-emerald-600",
    ownerStarOff: "text-[#d8cdb8]",
    quote: "text-[#5c4d33]",
  } : {
    card: "bg-white/[0.04] border border-white/10 hover:bg-white/[0.07]",
    logoBorder: "border-white/10",
    mono: "bg-gradient-to-br from-amber-400/30 to-fuchsia-500/30 border-white/10 text-amber-300",
    name: "text-white",
    muted: "text-white/40",
    faint: "text-white/30",
    star: "text-amber-300",
    starFill: "fill-amber-300",
    ownerStar: "text-emerald-300 fill-emerald-300",
    ownerStarOff: "text-white/15",
    quote: "text-white/60",
  };
  return (
    <div className={`grid gap-4 ${compact ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
      {list.map(p => (
        <div key={`${p.source}-${p.id}`} data-testid={`partner-card-${p.id}`}
          className={`rounded-2xl p-5 transition-all ${C.card}`}>
          <div className="flex items-center gap-3">
            {p.logo_url ? (
              <img src={p.logo_url} alt={p.name} className={`w-11 h-11 rounded-xl object-cover border ${C.logoBorder}`} />
            ) : (
              <div className={`w-11 h-11 rounded-xl border flex items-center justify-center font-semibold ${C.mono}`}>
                {(p.name || "?").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className={`text-sm font-semibold truncate ${C.name}`}>{p.name}</div>
              <div className={`text-[11px] flex items-center gap-1 truncate ${C.muted}`}>
                {p.city && <><MapPin className="w-3 h-3 flex-shrink-0" /> {p.city}</>}
              </div>
            </div>
            {p.featured && <Star className={`w-4 h-4 ml-auto flex-shrink-0 ${C.star} ${C.starFill}`} />}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {p.rating != null ? (
              <>
                <span className={`inline-flex items-center gap-1 text-sm font-semibold ${C.star}`}>
                  <Star className={`w-3.5 h-3.5 ${C.starFill}`} /> {p.rating}
                </span>
                {p.reviews_count > 0 && <span className={`text-[11px] ${C.muted}`}>{p.reviews_count} customer review{p.reviews_count > 1 ? "s" : ""}</span>}
              </>
            ) : (
              <span className={`text-[11px] ${C.faint}`}>Newly onboarded</span>
            )}
          </div>
          {p.owner_review?.rating && (
            <div className={`mt-3 border-l-2 pl-3 ${light ? "border-emerald-500/40" : "border-emerald-400/40"}`} data-testid={`owner-review-${p.id}`}>
              <span className="inline-flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={`s${s}`} className={`w-3 h-3 ${p.owner_review.rating >= s ? C.ownerStar : C.ownerStarOff}`} />
                ))}
                <span className={`text-[10px] ml-1.5 ${C.muted}`}>owner on Miracurl</span>
              </span>
              {!compact && p.owner_review.text && (
                <p className={`text-xs leading-relaxed mt-1.5 ${C.quote}`}>"{p.owner_review.text}"</p>
              )}
            </div>
          )}
          {!compact && p.blurb && (
            <p className={`text-xs leading-relaxed mt-3 border-l-2 pl-3 ${C.quote} ${light ? "border-[#C89B52]/50" : "border-amber-400/40"}`}>"{p.blurb}"</p>
          )}
        </div>
      ))}
    </div>
  );
}

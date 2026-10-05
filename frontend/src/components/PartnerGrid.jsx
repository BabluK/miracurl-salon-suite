import { Star, MapPin, ShieldCheck } from "lucide-react";


function Stars({ value, size = "w-3 h-3" }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={`${size} ${value >= s ? "text-[#b8863b] fill-[#b8863b]" : "text-[#e4d9c3]"}`} />
      ))}
    </span>
  );
}

// Shared public partner-card grid (Landing section + /partners page). Cream/gold theme only.
export function PartnerGrid({ partners, compact = false }) {
  if (!partners?.length) return null;
  const list = compact ? partners.slice(0, 8) : partners;
  return (
    <div className={`grid gap-5 ${compact ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
      {list.map(p => (
        <div key={`${p.source}-${p.id}`} data-testid={`partner-card-${p.id}`}
          className="group flex flex-col rounded-2xl bg-white border border-[#E8DCC3] p-5 shadow-[0_6px_24px_-14px_rgba(120,90,40,0.25)] hover:border-[#C89B52]/70 hover:shadow-[0_18px_40px_-18px_rgba(184,134,59,0.4)] hover:-translate-y-0.5 transition-[transform,box-shadow,border-color] duration-300">
          <div className="flex items-start gap-3">
            {p.logo_url ? (
              <img src={p.logo_url} alt={p.name} loading="lazy"
                className="w-12 h-12 rounded-xl object-cover border border-[#E8DCC3] bg-[#FBF6EC] flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl border border-[#D9B878]/60 bg-gradient-to-br from-[#F6E7C4] to-[#E3C485] text-[#7a5a1e] flex items-center justify-center font-bold text-sm flex-shrink-0">
                {(p.name || "?").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-[#2b2115] leading-tight line-clamp-2" title={p.name}>{p.name}</div>
              <div className="text-xs text-[#8b7a5e] mt-1 flex items-center gap-1 truncate min-h-[16px]">
                {p.city ? <><MapPin className="w-3 h-3 flex-shrink-0" /> {p.city}</> : <span>Miracurl partner</span>}
              </div>
            </div>
            {p.featured && (
              <span title="Featured partner" className="w-7 h-7 rounded-full bg-[#FBF1DC] border border-[#E8D4A8] flex items-center justify-center flex-shrink-0">
                <Star className={`w-3.5 h-3.5 text-[#b8863b] fill-[#b8863b]`} />
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 min-h-[22px]">
            {p.rating != null ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Stars value={Math.round(p.rating)} size="w-3.5 h-3.5" />
                  <span className="text-sm font-bold text-[#2b2115]">{Number(p.rating).toFixed(1)}</span>
                </span>
                {p.reviews_count > 0 && (
                  <span className="text-[11px] text-[#8b7a5e] whitespace-nowrap">{p.reviews_count} review{p.reviews_count > 1 ? "s" : ""}</span>
                )}
              </>
            ) : (
              <span className="text-[11px] font-medium text-[#a89877] inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Newly onboarded
              </span>
            )}
          </div>

          {(p.trusted || p.owner_review?.rating) ? (
            <div className="mt-auto pt-4">
              <div className="pt-3 border-t border-[#F1E8D6] flex flex-wrap items-center gap-x-3 gap-y-2">
                {p.trusted && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold tracking-wide" data-testid={`partner-trusted-${p.id}`}>
                    <ShieldCheck className="w-3 h-3" /> Trusted by Miracurl
                  </span>
                )}
                {p.owner_review?.rating ? (
                  <span className="inline-flex items-center gap-1.5" data-testid={`owner-review-${p.id}`}>
                    <Stars value={p.owner_review.rating} />
                    <span className="text-[10px] text-[#8b7a5e]">owner rating</span>
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {!compact && p.owner_review?.text && (
            <p className="text-xs leading-relaxed mt-3 pl-3 border-l-2 border-emerald-300 text-[#5c4d33] italic">"{p.owner_review.text}"</p>
          )}
          {!compact && p.blurb && (
            <p className="text-xs leading-relaxed mt-3 pl-3 border-l-2 border-[#C89B52]/60 text-[#5c4d33]">"{p.blurb}"</p>
          )}
        </div>
      ))}
    </div>
  );
}

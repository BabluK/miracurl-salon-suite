// Live mini booking-page preview — mirrors BookPublic's backdrop logic 1:1
const BG_IMAGES = {
  "img:aurora": { src: "/booking-bg/aurora.jpg", veil: 0.78 },
  "img:sunrise": { src: "/booking-bg/sunrise.jpg", veil: 0.78 },
  "img:salon-craft": { src: "/booking-bg/salon-craft.jpg", veil: 0.76 },
  "img:salon-blush": { src: "/booking-bg/salon-blush.jpg", veil: 0.76 },
  "img:salon-emerald": { src: "/booking-bg/salon-emerald.jpg", veil: 0.35 },
  "img:salon-noir": { src: "/booking-bg/salon-noir.jpg", veil: 0.3 },
  "img:dining-fine": { src: "/booking-bg/dining-fine.jpg", veil: 0.76 },
  "img:dining-emerald": { src: "/booking-bg/dining-emerald.jpg", veil: 0.35 },
  "img:dining-noir": { src: "/booking-bg/dining-noir.jpg", veil: 0.3 },
  "img:dining-harvest": { src: "/booking-bg/dining-harvest.jpg", veil: 0.62 },
  "img:champagne": { src: "/booking-bg/champagne-gold.jpg", veil: 0.7 },
  "img:royal-gold": { src: "/booking-bg/royal-gold.jpg", veil: 0.3 },
};

export function BookingPreview({ bg, heroImage, name, logoUrl, restaurant, headerBg, logoShape }) {
  const img = BG_IMAGES[bg];
  const pageStyle = img
    ? { background: `linear-gradient(rgba(24,16,27,${img.veil}), rgba(24,16,27,${img.veil})), url(${img.src}) center / cover no-repeat` }
    : { background: bg || "linear-gradient(160deg, #17131c 0%, #211a29 55%, #171320 100%)" };

  return (
    <div data-testid="booking-live-preview" className="w-full max-w-[240px] mx-auto select-none">
      <div className="rounded-[18px] border-4 border-slate-800 shadow-xl overflow-hidden bg-slate-800">
        <div className="rounded-[14px] overflow-hidden" style={pageStyle}>
          {/* top bar */}
          <div className="border-b border-[#e8dcc0] px-2.5 py-1.5 flex items-center gap-1.5" style={{ background: headerBg || "rgba(253,251,244,0.95)" }}>
            {logoUrl ? (
              logoShape === "square" ? (
                <span className="h-4 px-1 rounded-sm bg-[#17141c] flex items-center justify-center">
                  <img src={logoUrl} alt="" className="h-3 w-auto max-w-[34px] object-contain" />
                </span>
              ) : (
                <img src={logoUrl} alt="" className="w-4 h-4 rounded-full object-cover ring-1 ring-[#d4af37]" />
              )
            ) : (
              <span className="w-4 h-4 rounded-full bg-[#17141c] text-[#e8c37f] text-[7px] font-bold flex items-center justify-center">{(name || "M").charAt(0)}</span>
            )}
            <span className="text-[7px] font-semibold text-[#8a6d1f] truncate">{name || "Your Business"}</span>
            <span className="ml-auto px-1.5 py-0.5 rounded-full bg-gradient-to-r from-[#d4af37] to-[#e6c66e] text-[#17141c] text-[5.5px] font-bold whitespace-nowrap">
              {restaurant ? "Reserve ✦" : "Book ✦"}
            </span>
          </div>
          {/* hero */}
          <div className="relative h-16">
            {heroImage && <img src={`${heroImage}${heroImage.includes("unsplash") ? "&w=400" : ""}`} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-transparent" />
            <div className="relative p-2">
              <div className="text-[5px] tracking-[0.2em] uppercase text-[#d4af37]">{restaurant ? "Reserve your table" : "Book your visit"}</div>
              <div className="text-[9px] font-serif text-white leading-tight mt-0.5">{restaurant ? "Great food, warm company." : "Where elegance meets style."}</div>
            </div>
          </div>
          {/* body on the chosen backdrop */}
          <div className="p-2 space-y-1.5 min-h-[120px]">
            <div className="text-[8px] font-serif text-white">{restaurant ? "Pre-pick your dishes" : "Choose your services"}</div>
            {[0, 1].map(i => (
              <div key={i} className="rounded-md bg-black/45 border border-white/10 px-2 py-1.5 flex items-center justify-between">
                <span className="space-y-1">
                  <span className="block h-1.5 w-16 rounded bg-white/70" />
                  <span className="block h-1 w-9 rounded bg-white/30" />
                </span>
                <span className="px-1.5 py-0.5 rounded border border-[#d4af37]/60 text-[#d4af37] text-[5.5px]">Select</span>
              </div>
            ))}
            <div className="flex justify-end pt-0.5">
              <span className="px-2 py-1 rounded-full bg-gradient-to-r from-[#d4af37] to-[#e6c66e] text-[#17141c] text-[6px] font-bold">Continue →</span>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 text-center mt-1.5">Live preview — updates as you pick ✦</p>
    </div>
  );
}

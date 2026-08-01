import { Flame, Sparkles, Check, Plus } from "lucide-react";

export function OffersPanel({ offers, offerApplied, onApplyOffer, onRemoveOffer, onAddPackage, cart, sym = "₹" }) {
  const dayOffers = offers?.day_offers || [];
  const miraPkgs = offers?.mira_packages || [];
  const inCart = (id) => cart.some(c => c.type === "mira_package" && c.ref_id === id);
  return (
    <div className="lg:col-span-5 xl:col-span-4 space-y-4" data-testid="pos-offers-panel">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-700 mb-1 flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-500" /> Today's Mira Offers
        </h3>
        <p className="text-[11px] text-slate-400 mb-3">Accepted offers from Dashboard / Offer Maker — tap to apply the discount to this bill.</p>
        {dayOffers.length === 0 && (
          <p className="text-xs text-slate-400 py-3 text-center">No offer accepted today — accept one from the Dashboard or Offer Maker page.</p>
        )}
        <div className="space-y-2">
          {dayOffers.map(o => {
            const applied = offerApplied?.id === o.id;
            return (
              <div key={o.id} data-testid={`pos-offer-${o.id}`}
                className={`rounded-xl border p-3 transition ${applied ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-orange-300"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{o.kind === "flash" ? "⚡ " : ""}{o.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{o.offer_text}</div>
                    {(o.services || []).length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-1 truncate">
                        {o.services.map(s => `${s.name} ${sym}${Number(s.offer_price || 0).toFixed(0)}`).join(" · ")}
                      </div>
                    )}
                  </div>
                  {o.discount_pct > 0 && (
                    <span className="shrink-0 bg-orange-100 text-orange-700 text-[11px] font-bold rounded-full px-2 py-1">{o.discount_pct}% OFF</span>
                  )}
                </div>
                {o.discount_pct > 0 ? (
                  applied ? (
                    <button onClick={onRemoveOffer} data-testid={`pos-offer-remove-${o.id}`}
                      className="mt-2 w-full text-xs font-bold rounded-lg py-2 bg-orange-500 text-white flex items-center justify-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Applied to bill — tap to remove
                    </button>
                  ) : (
                    <button onClick={() => onApplyOffer(o)} data-testid={`pos-offer-apply-${o.id}`}
                      className="mt-2 w-full text-xs font-bold rounded-lg py-2 border border-orange-300 text-orange-600 hover:bg-orange-50">
                      Apply {o.discount_pct}% to this bill
                    </button>
                  )
                ) : (
                  <p className="mt-2 text-[10px] text-slate-400">Fixed-price offer — add the services at their offer price.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-700 mb-1 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-fuchsia-500" /> Mira Packages (live)
        </h3>
        <p className="text-[11px] text-slate-400 mb-3">Packages published from the Dashboard — tap to add to the bill at the package price.</p>
        {miraPkgs.length === 0 && (
          <p className="text-xs text-slate-400 py-3 text-center">No live packages — ask Mira on the Dashboard to create & publish one.</p>
        )}
        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {miraPkgs.map(p => (
            <div key={p.id} data-testid={`pos-mira-pkg-${p.id}`} className="rounded-xl border border-slate-200 p-3 hover:border-fuchsia-300 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {(p.services || []).map(s => s.name).join(" + ")}
                  </div>
                </div>
                {p.discount_pct > 0 && (
                  <span className="shrink-0 bg-fuchsia-100 text-fuchsia-700 text-[11px] font-bold rounded-full px-2 py-1">{Number(p.discount_pct).toFixed(0)}% OFF</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-sm">
                  {p.total_value > p.package_price && <span className="text-slate-400 line-through mr-2 text-xs">{sym}{Number(p.total_value).toFixed(0)}</span>}
                  <span className="font-bold text-slate-900">{sym}{Number(p.package_price).toFixed(0)}</span>
                </div>
                <button onClick={() => onAddPackage(p)} disabled={inCart(p.id)} data-testid={`pos-mira-pkg-add-${p.id}`}
                  className={`text-xs font-bold rounded-lg px-3 py-1.5 flex items-center gap-1 ${inCart(p.id)
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-fuchsia-600 text-white hover:bg-fuchsia-500"}`}>
                  {inCart(p.id) ? <><Check className="w-3 h-3" /> In bill</> : <><Plus className="w-3 h-3" /> Add to bill</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

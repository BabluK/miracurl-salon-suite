import { Wifi } from "lucide-react";
import { cardDigits } from "@/components/MembershipCardVisual";

const TIER_HEX = {
  silver: "#94a3b8",
  gold: "#d4af37",
  platinum: "#8b5cf6",
  diamond: "#22d3ee",
  custom: "#fb923c",
};

const tierOf = (m) => {
  const t = `${m.tier || ""} ${m.name || ""}`.toLowerCase();
  return ["diamond", "platinum", "gold", "silver"].find((k) => t.includes(k)) || "custom";
};

export const MembershipSellModal = ({ memberships, salonName, logoUrl, sym, onPick, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    data-testid="membership-sell-modal" onClick={onClose}>
    <div className="bg-[#12101a] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}>
      <div className="px-5 pt-5 pb-3">
        <div className="text-[#e6c65a] font-bold text-base tracking-wide">💳 Sell a Membership</div>
        <div className="text-[11px] text-white/45 mt-0.5">Tap a card to add it to this bill — the personalised member card is generated once the guest pays</div>
      </div>
      <div className="px-4 pb-3 space-y-3 max-h-[62vh] overflow-y-auto">
        {memberships.length === 0 && (
          <p className="text-xs text-white/40 text-center py-6">No active membership plans — create them under Offers &amp; Plans</p>
        )}
        {memberships.map((m) => {
          const tier = tierOf(m);
          const hex = TIER_HEX[tier];
          return (
            <button key={m.id} data-testid={`membership-sell-plan-${m.id}`} onClick={() => onPick(m)}
              className="w-full text-left rounded-2xl p-4 relative overflow-hidden transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
              style={{
                border: `1.5px solid ${hex}`,
                background: `radial-gradient(circle at 85% 0%, ${hex}55, transparent 55%), radial-gradient(circle at 0% 100%, ${hex}22, transparent 50%), linear-gradient(135deg, #17121f, #0c0a11)`,
                boxShadow: `0 10px 34px ${hex}33`,
              }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {logoUrl && <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/20 shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-[#e6c65a] font-bold tracking-[0.14em] text-[11px] leading-tight truncate">
                      {(salonName || "YOUR SALON").toUpperCase()}
                    </div>
                    <div className="text-white/40 text-[7.5px] tracking-[0.2em] mt-0.5">PREMIUM MEMBERSHIP CARD</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[13px] tracking-wide text-white">{(m.name || tier).toUpperCase()}</div>
                  <div className="text-white/45 text-[8px] tracking-widest">MEMBER</div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-6 rounded relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg,#e8c96a,#b8860b 60%,#e8c96a)" }}>
                    <div className="absolute inset-x-0 top-[6px] h-px bg-amber-900/60" />
                    <div className="absolute inset-x-0 top-[12px] h-px bg-amber-900/60" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-amber-900/60" />
                  </div>
                  <span className="font-mono text-[13px] tracking-[0.12em] text-[#e6c65a]">
                    {cardDigits(m.id).slice(0, 19)}
                  </span>
                </div>
                <Wifi className="w-4 h-4 text-white/60 rotate-90" />
              </div>

              <div className="flex items-end justify-between mt-3">
                <div className="text-[10px] text-white/60">
                  <span className="text-white/90 font-semibold">{m.discount_pct}% off services</span>
                  {Number(m.cashback_pct) ? <> · {m.cashback_pct}% cashback</> : null} · {m.validity_days || 180} days
                </div>
                <div className="font-extrabold text-[15px]" style={{ color: hex }}>
                  {sym}{Number(m.price).toLocaleString("en-IN")}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="px-4 pb-4">
        <button onClick={onClose} data-testid="membership-sell-close"
          className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-bold hover:bg-white/10 transition">Close</button>
      </div>
    </div>
  </div>
);

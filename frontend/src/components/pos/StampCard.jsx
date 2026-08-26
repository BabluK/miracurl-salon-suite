import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";

// Gold stamp card shown in POS when a guest with a phone is selected (salons only)
export function StampCard({ phone }) {
  const [card, setCard] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCard(null);
    if (!phone) return;
    api.get("/loyalty/stamps", { params: { phone } }).then(r => setCard(r.data)).catch(() => {});
  }, [phone]);

  if (!phone || !card?.enabled) return null;

  const act = async (path, okMsg) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/loyalty/stamps/${path}`, { phone });
      setCard(data);
      toast.success(okMsg(data));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-50 to-yellow-50 p-3" data-testid="pos-stamp-card">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] tracking-[0.2em] uppercase text-amber-700 font-bold">✦ Gold Stamp Card</div>
        <div className="flex gap-1.5">
          <button disabled={busy} data-testid="pos-stamp-add-btn"
            onClick={() => act("add", d => `Stamp added ✦ ${d.stamps}/${d.needed}`)}
            className="px-2.5 py-1 rounded-full border border-amber-400 text-amber-700 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-50">
            + Add stamp
          </button>
          {card.found && card.rewards_available > 0 && (
            <button disabled={busy} data-testid="pos-stamp-redeem-btn"
              onClick={() => act("redeem", d => `🎁 Redeemed: ${d.reward_label} — apply ${d.reward_discount_pct}% off in the discount field`)}
              className="px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-[11px] font-bold shadow hover:brightness-105 disabled:opacity-50">
              🎁 Redeem {card.reward_label}
            </button>
          )}
        </div>
      </div>
      {card.found ? (
        <>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {Array.from({ length: card.needed }).map((_, i) => (
              <span key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 ${i < card.stamps ? "bg-gradient-to-br from-amber-400 to-yellow-600 border-amber-300 text-white shadow" : "border-amber-200 text-amber-300"}`}>
                {i < card.stamps ? "✦" : "·"}
              </span>
            ))}
            {card.rewards_available > 0 && <span className="text-[11px] font-bold text-amber-700 ml-1" data-testid="pos-stamp-reward-badge">🎁 ×{card.rewards_available} reward ready</span>}
          </div>
          <div className="text-[11px] text-amber-700/70 mt-1.5">
            {card.rewards_available > 0 ? `Card full — redeem "${card.reward_label}" for this guest ✦` : `${card.needed - card.stamps} more visits to: ${card.reward_label}`}
          </div>
        </>
      ) : (
        <div className="text-[11px] text-amber-700/70 mt-1.5">New card — first stamp added automatically with this bill ✦</div>
      )}
    </div>
  );
}

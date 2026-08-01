import { Gift, X, AlertTriangle, CheckCircle2 } from "lucide-react";

const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
};

export default function GiftCardInfoModal({ gcInfo, gcCode, giftApplied, dueAfterGift, sym, onClose }) {
  if (!gcInfo) return null;
  const balanceAfter = Math.max(0, gcInfo.balance - giftApplied);
  const lowBalance = dueAfterGift > 0;
  const Row = ({ label, value, strong, testid }) => (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm ${strong ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`} data-testid={testid}>{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="gift-card-info-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-amber-400 to-yellow-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-black">
            <Gift className="w-5 h-5" />
            <div>
              <div className="font-bold text-sm">Gift Card {gcCode}</div>
              <div className="text-[11px] opacity-80">{gcInfo.recipient_name}{gcInfo.occasion ? ` · ${gcInfo.occasion}` : ""}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-black/60 hover:text-black" data-testid="gift-card-info-close"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4">
          <Row label="Gift card taken on" value={fmtDate(gcInfo.purchased_on)} testid="gc-info-purchased" />
          <Row label="Original value" value={`${sym}${Number(gcInfo.amount).toFixed(0)}`} testid="gc-info-amount" />
          <Row label="Used so far" value={gcInfo.redeemed_total > 0 ? `−${sym}${Number(gcInfo.redeemed_total).toFixed(0)} (${gcInfo.times_used} ${gcInfo.times_used === 1 ? "visit" : "visits"})` : "Never used"} testid="gc-info-used" />
          {gcInfo.last_used_on && (
            <Row label="Last applied" value={`${fmtDate(gcInfo.last_used_on)} · −${sym}${Number(gcInfo.last_used_amount || 0).toFixed(0)}`} testid="gc-info-last-used" />
          )}
          <Row label="Current balance" value={`${sym}${Number(gcInfo.balance).toFixed(0)}`} strong testid="gc-info-balance" />
          <Row label="Applied to this bill" value={`−${sym}${giftApplied.toFixed(0)}`} strong testid="gc-info-applied" />
          <Row label="Balance after this bill" value={`${sym}${balanceAfter.toFixed(0)}`} strong testid="gc-info-remaining" />
          {gcInfo.expires_at && <Row label="Valid till" value={fmtDate(gcInfo.expires_at)} testid="gc-info-expires" />}

          {lowBalance ? (
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5" data-testid="gc-low-balance-warning">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <b>Low balance</b> — this card covers only <b>{sym}{giftApplied.toFixed(0)}</b> of the bill.
                Guest still pays <b>{sym}{dueAfterGift.toFixed(0)}</b> by cash/card/UPI.
              </p>
            </div>
          ) : (
            <div className="mt-3 flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5" data-testid="gc-covers-bill-note">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-emerald-800 leading-relaxed">This card fully covers the bill — nothing due from the guest.</p>
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-3 text-center">Balance is deducted only when you complete checkout.</p>

          <button onClick={onClose} data-testid="gc-info-ok-btn"
            className="w-full mt-3 bg-slate-900 text-white text-sm font-bold rounded-xl py-2.5 hover:bg-slate-700 transition-colors">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { X, Users } from "lucide-react";
import { SplitStaffModal } from "@/components/pos/SplitStaffModal";

export function CartTable({
  cart, staff, taxEnabled, taxPct, updateLine, setLineStaff, removeLine,
  couponCode, setCouponCode, setCouponInfo, checkCoupon, couponInfo,
  membershipDiscount, couponDiscount, pointsUsed, totalDiscount, tax, total, sym = "₹",
  offerApplied, offerDiscount = 0,
  overallDisc, setOverallDisc, overallDiscount = 0,
  overallDiscMode = "amt", setOverallDiscMode,
  isSalon = false, splitLine,
}) {
  const [splitFor, setSplitFor] = useState(null);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-3 py-3 font-medium">Staff</th>
              <th className="text-left px-3 py-3 font-medium">Qty</th>
              <th className="text-right px-3 py-3 font-medium">Price</th>
              <th className="text-right px-3 py-3 font-medium">Sub Total</th>
              <th className="text-right px-3 py-3 font-medium">Disc%</th>
              {taxEnabled && <th className="text-right px-3 py-3 font-medium">Tax</th>}
              <th className="text-right px-3 py-3 font-medium">Total</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {cart.map((c, i) => {
              const sub = c.qty * c.price;
              const disc = sub * ((c.disc_pct || 0) / 100);
              const lineTaxable = sub - disc;
              const lineTax = lineTaxable * taxPct / 100;
              return (
                <tr key={`${c.type}:${c.ref_id}:${i}`} className="border-t border-slate-100" data-testid={`cart-line-${i}`}>
                  <td className="px-4 py-3 text-slate-800">{c.name}{c.split && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">split</span>}</td>
                  <td className="px-3 py-3">
                    <select
                      data-testid={`cart-line-staff-${i}`}
                      value={c.staff_id || ""}
                      onChange={e => setLineStaff(i, e.target.value)}
                      className="text-slate-800 text-xs py-1 px-2 rounded bg-slate-50 border border-slate-200 min-w-[110px]"
                    >
                      <option value="">— Stylist —</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {isSalon && c.type === "service" && !c.split && c.qty * c.price > 0 && (
                      <button onClick={() => setSplitFor(i)} data-testid={`cart-line-split-${i}`}
                        title="Two stylists did this together? Split the amount between them"
                        className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:text-amber-800">
                        <Users className="w-3 h-3" /> Split by staff
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-md">
                      <button onClick={() => updateLine(i, { qty: Math.max(1, c.qty - 1) })} className="px-2 py-1 text-slate-500 hover:text-slate-800">−</button>
                      <span className="px-2 text-sm text-slate-800 min-w-[20px] text-center">{c.qty}</span>
                      <button onClick={() => updateLine(i, { qty: c.qty + 1 })} className="px-2 py-1 text-slate-500 hover:text-slate-800">+</button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      type="number" min="0" step="10"
                      data-testid={`cart-line-price-${i}`}
                      value={c.price}
                      onChange={e => updateLine(i, { price: Math.max(0, Number(e.target.value || 0)) })}
                      title="Tap to edit the price for this bill only"
                      className="w-20 text-right py-1 px-2 rounded bg-slate-50 border border-slate-200 text-xs text-slate-800 font-semibold focus:border-sky-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">{sym}{sub.toFixed(0)}</td>
                  <td className="px-3 py-3 text-right">
                    <input
                      type="number" min="0" max="100"
                      data-testid={`cart-line-disc-${i}`}
                      value={c.disc_pct || 0}
                      onChange={e => updateLine(i, { disc_pct: Math.min(100, Math.max(0, Number(e.target.value || 0))) })}
                      className="w-14 text-right py-1 px-2 rounded bg-slate-50 border border-slate-200 text-xs text-slate-800 font-semibold"
                    />
                  </td>
                  {taxEnabled && <td className="px-3 py-3 text-right text-slate-500">{sym}{lineTax.toFixed(0)}</td>}
                  <td className="px-3 py-3 text-right font-semibold text-slate-800">{sym}{(lineTaxable + lineTax).toFixed(0)}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500" data-testid={`cart-line-remove-${i}`}>
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {cart.length === 0 && (
              <tr><td colSpan={taxEnabled ? 9 : 8} className="text-center text-slate-400 py-10 text-sm">Tap a service or product on the left to add it</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2.5 text-sm text-slate-600">
        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <span className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50 border-r border-slate-200">Coupon</span>
          <input
            data-testid="pos-coupon-input"
            value={couponCode}
            onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponInfo(null); }}
            onKeyDown={e => e.key === "Enter" && checkCoupon()}
            placeholder="CODE"
            className="w-24 px-2.5 py-1.5 bg-white text-xs font-mono uppercase text-slate-800 placeholder:text-slate-300 focus:outline-none"
          />
          <button type="button" data-testid="pos-coupon-apply-btn" onClick={checkCoupon}
            className="px-3 py-1.5 text-xs text-sky-600 font-bold hover:bg-sky-50 transition-colors border-l border-slate-200">Apply</button>
        </div>
        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <span className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50 border-r border-slate-200">Overall disc</span>
          <button type="button" data-testid="pos-overall-disc-mode-amt"
            onClick={() => setOverallDiscMode("amt")}
            title="Flat amount off"
            className={`px-2 py-1.5 text-xs font-bold transition-colors ${overallDiscMode === "amt" ? "bg-slate-900 text-amber-300" : "text-slate-400 hover:bg-slate-100"}`}>{sym}</button>
          <button type="button" data-testid="pos-overall-disc-mode-pct"
            onClick={() => setOverallDiscMode("pct")}
            title="Percentage off"
            className={`px-2 py-1.5 text-xs font-bold transition-colors border-r border-slate-200 ${overallDiscMode === "pct" ? "bg-slate-900 text-amber-300" : "text-slate-400 hover:bg-slate-100"}`}>%</button>
          <input
            data-testid="pos-overall-discount-input"
            type="number" min="0" max={overallDiscMode === "pct" ? 100 : undefined}
            value={overallDisc}
            onChange={e => setOverallDisc(e.target.value)}
            placeholder="0"
            title={overallDiscMode === "pct" ? "Percentage discount on the whole bill" : "Flat discount on the whole bill"}
            className="w-16 px-2.5 py-1.5 bg-white text-xs text-right text-slate-800 font-semibold placeholder:text-slate-300 focus:outline-none"
          />
        </div>
        {(overallDiscount > 0 || membershipDiscount > 0 || couponDiscount > 0 || offerDiscount > 0 || pointsUsed > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {overallDiscount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold" data-testid="pos-overall-discount-chip">
                ✂ −{sym}{overallDiscount.toFixed(0)}{overallDiscMode === "pct" ? ` (${Math.min(Number(overallDisc) || 0, 100)}%)` : ""}
              </span>
            )}
            {membershipDiscount > 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-600 text-xs font-semibold" data-testid="pos-membership-discount">👑 −{sym}{membershipDiscount.toFixed(0)}</span>}
            {couponDiscount > 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-semibold" data-testid="pos-coupon-discount">🎟 {couponInfo.code} −{sym}{couponDiscount.toFixed(0)}</span>}
            {offerDiscount > 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-xs font-semibold" data-testid="pos-offer-discount">🔥 {offerApplied?.title || "Offer"} −{sym}{offerDiscount.toFixed(0)}</span>}
            {pointsUsed > 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-xs font-semibold" data-testid="pos-points-discount">🪙 −{sym}{pointsUsed.toFixed(0)}</span>}
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">Discount <span className="font-bold text-slate-800 ml-0.5">{sym}{totalDiscount.toFixed(0)}</span></span>
          {taxEnabled && (
            <span className="text-xs text-slate-500">Tax ({taxPct}%) <span className="font-bold text-slate-800 ml-0.5">{sym}{tax.toFixed(0)}</span></span>
          )}
          <span className="inline-flex items-baseline gap-2 pl-3.5 pr-4 py-1.5 rounded-xl bg-slate-900 shadow-sm">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Grand Total</span>
            <span className="font-bold text-amber-300 text-lg leading-none" data-testid="pos-grand-total">{sym}{total.toFixed(0)}</span>
          </span>
        </div>
      </div>
      {splitFor !== null && cart[splitFor] && (
        <SplitStaffModal line={cart[splitFor]} staff={staff} sym={sym}
          onApply={(shares) => splitLine(splitFor, shares)} onClose={() => setSplitFor(null)} />
      )}
    </div>
  );
}

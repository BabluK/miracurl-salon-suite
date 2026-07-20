import { Heart } from "lucide-react";

const PCT_PRESETS = [15, 18, 20, 25];
const INR_PRESETS = [10, 20, 50, 100, 200, 500];

export function TipSection({ sym, isInr, taxable, tipPct, setTipPct, customTip, setCustomTip,
                             tipAmount, tipStaffId, setTipStaffId, staff, grandTotal }) {
  const pickPct = (pct) => { setTipPct(pct); setCustomTip(0); };
  const pickFlat = (amt) => { setCustomTip(amt); setTipPct(null); };
  const btnCls = (active) => `px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${active
    ? "bg-rose-500 text-white border-rose-500" : "border-slate-200 text-slate-600 hover:border-rose-200"}`;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="pos-tip-section">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-500" />
          <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Tip for the stylist (optional) — goes 100% to your team</span>
        </div>
        {tipAmount > 0 && (
          <span className="text-xs font-semibold text-rose-600" data-testid="pos-tip-amount">
            Tip {sym}{tipAmount.toFixed(2)} · Total incl. tip <b>{sym}{grandTotal.toFixed(2)}</b>
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" data-testid="pos-tip-none" onClick={() => { setTipPct(null); setCustomTip(0); }}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${tipPct == null && !customTip
            ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
          No tip
        </button>
        {isInr ? INR_PRESETS.map(a => (
          <button key={a} type="button" data-testid={`pos-tip-flat-${a}`} onClick={() => pickFlat(a)}
            className={btnCls(tipPct == null && customTip === a)}>
            ₹{a}
          </button>
        )) : PCT_PRESETS.map(p => (
          <button key={p} type="button" data-testid={`pos-tip-${p}`} onClick={() => pickPct(p)}
            className={btnCls(tipPct === p)}>
            {p}%{taxable > 0 && <span className="ml-1 opacity-70">({sym}{(Math.round(taxable * p) / 100).toFixed(0)})</span>}
          </button>
        ))}
        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
          <span>{sym}</span>
          <input type="number" min="0" data-testid="pos-tip-custom"
            value={customTip || ""} placeholder="Custom"
            onChange={e => { setCustomTip(Math.max(0, Number(e.target.value || 0))); setTipPct(null); }}
            className="w-20 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-right text-slate-800 font-semibold" />
        </span>
        {tipAmount > 0 && (
          <select data-testid="pos-tip-staff" value={tipStaffId} onChange={e => setTipStaffId(e.target.value)}
            className="text-xs py-1.5 px-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
            <option value="">Tip goes to: invoice stylist</option>
            {staff.map(s => <option key={s.id} value={s.id}>Tip goes to: {s.name}</option>)}
          </select>
        )}
      </div>
      {isInr && tipAmount > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">Hand this tip to the stylist in cash, or mark it paid later from Reports → Tips by Stylist.</p>
      )}
    </div>
  );
}

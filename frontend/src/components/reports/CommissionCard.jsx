import { Users, Percent, Lock, Unlock, Trash2 } from "lucide-react";
import { SectionCard, TH, THEAD, TR, TD } from "./SectionCard";

export function Mini({ label, value, accent = "text-slate-900", hint }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">{label}</div>
      <div className={`font-playfair text-2xl mt-0.5 ${accent}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export function CommissionCard({ commission, unlocked, pct, setPct, rateUnlocked, unlockRate, unlockCommission, eraseBilling, erasing, inr }) {
  const right = (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-semibold">Rate</label>
      <div className="relative">
        <input data-testid="commission-pct" type="number" min="0" max="100" step="0.5" value={pct} disabled={!rateUnlocked}
          onChange={e => setPct(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
          className="text-slate-800 w-20 pl-3 pr-7 py-2 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#9b3a4e]/30 disabled:opacity-60 disabled:cursor-not-allowed" />
        <Percent className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
      </div>
      {!rateUnlocked ? (
        <button onClick={unlockRate} data-testid="commission-rate-unlock-btn" title="Changing the rate needs the Admin PIN"
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"><Lock className="w-3 h-3" /> Unlock rate</button>
      ) : <Unlock className="w-3.5 h-3.5 text-emerald-500" title="Rate unlocked for this session" />}
      <span className="w-px h-5 bg-slate-200 mx-1" />
      <button onClick={() => eraseBilling("last_month")} disabled={erasing} data-testid="erase-last-month-btn"
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"><Trash2 className="w-3 h-3" /> Erase last month</button>
      <button onClick={() => eraseBilling("all")} disabled={erasing} data-testid="erase-all-btn"
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white hover:brightness-110 disabled:opacity-50"><Trash2 className="w-3 h-3" /> Erase all data</button>
    </div>
  );
  return (
    <SectionCard icon={Users} tone="violet" title="Per-Stylist Commission" subtitle="Gross revenue attributed to each stylist and their commission at the chosen rate." right={right} testid="commission-card">
      {!unlocked && !commission && (
        <div className="mt-5 p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50" data-testid="commission-locked-state">
          <Lock className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-slate-700 font-medium">Commission figures are PIN-protected</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Staff earnings stay private — unlock with the Owner PIN to view.</p>
          <button onClick={unlockCommission} data-testid="commission-unlock-btn" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white text-xs font-semibold hover:brightness-110"><Lock className="w-3 h-3" /> Unlock with Owner PIN</button>
        </div>
      )}
      {commission && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <Mini label="Total gross" value={inr(commission.total_gross)} />
            <Mini label="Total commission" value={inr(commission.total_commission)} accent="text-[#9b3a4e]" />
            <Mini label="Stylists earning" value={commission.rows.length} />
            <Mini label="Unassigned gross" value={inr(commission.unassigned.gross_revenue)} hint={commission.unassigned.gross_revenue > 0 ? "lines without staff_id" : ""} />
          </div>
          <div className="overflow-x-auto mt-4 rounded-2xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className={THEAD}><tr><th className={TH}>Stylist</th><th className={TH}>Role</th><th className={`${TH} text-right`}>Items</th><th className={`${TH} text-right`}>Gross Revenue</th><th className={`${TH} text-right`}>Commission ({pct}%)</th></tr></thead>
              <tbody>
                {commission.rows.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-8 text-slate-500">No staff-attributed sales in this range yet. Tip: assign a Stylist on each POS cart line and the data lights up here.</td></tr>
                ) : commission.rows.map(r => (
                  <tr key={r.staff_id} className={TR} data-testid={`commission-row-${r.staff_id}`}>
                    <td className={`${TD} text-slate-800 font-medium`}>{r.staff_name}</td>
                    <td className={`${TD} text-xs text-slate-500`}>{r.role || "—"}</td>
                    <td className={`${TD} text-right text-slate-700`}>{r.item_count} <span className="text-[10px] text-slate-400">({r.service_count}s · {r.product_count}p)</span></td>
                    <td className={`${TD} text-right text-slate-800 font-medium`}>{inr(r.gross_revenue)}</td>
                    <td className={`${TD} text-right text-[#9b3a4e] font-semibold`}>{inr(r.commission_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}

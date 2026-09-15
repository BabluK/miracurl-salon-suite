import { Heart } from "lucide-react";
import { SectionCard, TH, THEAD, TR, TD } from "./SectionCard";
import { Mini } from "./CommissionCard";

export function TipsPayoutTable({ tips, inr, markTipsPaid }) {
  return (
    <SectionCard icon={Heart} tone="rose" title="Tips by Stylist" subtitle="Tips captured at billing — 100% belongs to your team" testid="tips-card">
      {tips && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <Mini label="Total tips" value={inr(tips.total_tips)} accent="text-[#9b3a4e]" />
            <Mini label="Pending handover" value={inr(tips.total_pending)} accent="text-amber-600" hint={tips.total_pending > 0 ? "mark paid when you hand cash over" : ""} />
            <Mini label="Stylists tipped" value={tips.rows.length} />
            <Mini label="Unassigned tips" value={inr(tips.unassigned_total)} hint={tips.unassigned_total > 0 ? "no stylist picked at POS" : ""} />
          </div>
          <div className="overflow-x-auto mt-4 rounded-2xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className={THEAD}><tr><th className={TH}>Stylist</th><th className={`${TH} text-right`}>Tipped Bills</th><th className={`${TH} text-right`}>Total Tips</th><th className={`${TH} text-right`}>Paid Out</th><th className={`${TH} text-right`}>Pending</th><th className={TH}></th></tr></thead>
              <tbody>
                {tips.rows.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-8 text-slate-500">No tips in this range yet. Tip presets appear on the POS billing screen — tips go 100% to your team, separate from salary.</td></tr>
                ) : tips.rows.map(r => (
                  <tr key={r.staff_id} className={TR} data-testid={`tips-row-${r.staff_id}`}>
                    <td className={`${TD} text-slate-800 font-medium`}>{r.staff_name}</td>
                    <td className={`${TD} text-right text-slate-700`}>{r.tip_count}</td>
                    <td className={`${TD} text-right text-[#9b3a4e] font-semibold`}>{inr(r.tips_total)}</td>
                    <td className={`${TD} text-right text-emerald-600`}>{inr(r.paid_total)}</td>
                    <td className={`${TD} text-right text-amber-600 font-semibold`}>{inr(r.pending_total)}</td>
                    <td className={`${TD} text-right`}>
                      {r.pending_total > 0 && (
                        <button onClick={() => markTipsPaid(r)} data-testid={`tips-mark-paid-${r.staff_id}`}
                          title="Hand the cash to this stylist, then mark it paid here"
                          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700">✓ Mark {inr(r.pending_total)} paid</button>
                      )}
                    </td>
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

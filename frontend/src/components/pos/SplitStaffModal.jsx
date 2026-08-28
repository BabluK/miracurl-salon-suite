import { useState } from "react";
import { toast } from "sonner";
import { X, Users } from "lucide-react";

export function SplitStaffModal({ line, staff, sym = "₹", onApply, onClose }) {
  const total = (line.qty || 1) * (line.price || 0);
  const half = Math.round((total / 2) * 100) / 100;
  const [rows, setRows] = useState([
    { staff_id: line.staff_id || "", amount: half },
    { staff_id: "", amount: Math.round((total - half) * 100) / 100 },
  ]);

  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const balanced = Math.abs(sum - total) < 0.01;

  const rebalance = (i, amount) => {
    const amt = Math.min(total, Math.max(0, Number(amount) || 0));
    const other = Math.round((total - amt) * 100) / 100;
    setRows(rs => rs.map((r, j) => j === i ? { ...r, amount: amt } : { ...r, amount: other }));
  };

  const apply = () => {
    if (rows.some(r => !r.staff_id)) { toast.error("Pick both staff members"); return; }
    if (rows[0].staff_id === rows[1].staff_id) { toast.error("Choose two different staff members"); return; }
    if (!balanced) { toast.error(`Shares must add up to ${sym}${total.toLocaleString("en-IN")}`); return; }
    if (rows.some(r => (Number(r.amount) || 0) <= 0)) { toast.error("Each share must be more than 0"); return; }
    onApply(rows.map(r => {
      const s = staff.find(x => x.id === r.staff_id);
      return { staff_id: r.staff_id, staff_name: s?.name || "", amount: Math.round(Number(r.amount) * 100) / 100 };
    }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()} data-testid="split-staff-modal">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-playfair text-xl text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-amber-500" /> Split by staff</h3>
          <button onClick={onClose} data-testid="split-staff-close" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          <span className="font-semibold text-slate-700">{line.name}</span> · {sym}{total.toLocaleString("en-IN")} — each stylist gets credited their share in reports & commissions.
        </p>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={r.staff_id} data-testid={`split-staff-select-${i}`}
                onChange={e => setRow(i, { staff_id: e.target.value })}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-800">
                <option value="">— Staff {i + 1} —</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{sym}</span>
                <input type="number" min="0" step="any" value={r.amount} data-testid={`split-staff-amount-${i}`}
                  onChange={e => rebalance(i, e.target.value)}
                  className="w-32 border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm text-right font-semibold text-slate-800" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button type="button" data-testid="split-staff-5050" onClick={() => setRows(rs => rs.map((r, i) => ({ ...r, amount: i === 0 ? half : Math.round((total - half) * 100) / 100 })))}
            className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-500 hover:border-amber-400 hover:text-amber-700">50 / 50</button>
          <span className={`text-xs ml-auto font-semibold ${balanced ? "text-emerald-600" : "text-red-500"}`} data-testid="split-staff-sum">
            {sym}{sum.toLocaleString("en-IN")} / {sym}{total.toLocaleString("en-IN")}
          </span>
        </div>
        <button onClick={apply} data-testid="split-staff-apply-btn"
          className="w-full mt-4 py-3 rounded-xl bg-slate-900 text-amber-200 text-sm font-bold hover:bg-slate-800">
          Split bill between {rows.filter(r => r.staff_id).length === 2 ? "these 2 staff" : "2 staff"}
        </button>
      </div>
    </div>
  );
}

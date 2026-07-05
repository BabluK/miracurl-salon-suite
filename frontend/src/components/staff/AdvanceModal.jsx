import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { X } from "lucide-react";

export function AdvanceModal({ staff, onClose }) {
  const [rows, setRows] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = (rows || []).find(r => r.month === month);
  const maxAdv = Number(staff.max_advance) || 0;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/staff/${staff.id}/advances`);
      setRows(data);
    } catch { setRows([]); }
  }, [staff.id]);
  useEffect(() => { load(); }, [load]);

  async function give(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/staff/${staff.id}/advance`, { amount: parseFloat(amount) || 0, note });
      toast.success(`Advance recorded for ${staff.name}`);
      setAmount(""); setNote("");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't record advance");
    } finally { setBusy(false); }
  }

  async function undo(aid) {
    if (!window.confirm("Remove this advance entry?")) return;
    try {
      await api.delete(`/staff/${staff.id}/advance/${aid}`);
      toast.success("Advance removed");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't remove");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="card-light w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="advance-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-playfair text-xl">Salary advance — {staff.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 px-3 py-2 mb-4 space-y-0.5">
          <div>• Max limit: <b>{maxAdv > 0 ? `₹${maxAdv.toLocaleString("en-IN")}` : "not set (edit staff to set it)"}</b></div>
          <div>• One advance per month, only after the 15th</div>
          <div>• Auto-deducted from this month&apos;s salary slip</div>
        </div>
        {thisMonth ? (
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 mb-4 text-sm text-violet-800 flex items-center justify-between" data-testid="advance-this-month">
            <span>This month: <b>₹{Number(thisMonth.amount).toLocaleString("en-IN")}</b> on {thisMonth.created_at?.slice(0, 10)}</span>
            <button onClick={() => undo(thisMonth.id)} className="text-xs text-red-500 hover:underline">undo</button>
          </div>
        ) : (
          <form onSubmit={give} className="space-y-3 mb-4">
            <div>
              <label className="label-light block mb-1">Amount ₹ *</label>
              <input data-testid="advance-amount-input" required type="number" min="1" step="any" max={maxAdv > 0 ? maxAdv : undefined} className="input-light" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label-light block mb-1">Note</label>
              <input data-testid="advance-note-input" className="input-light" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. family emergency" maxLength={200} />
            </div>
            <button data-testid="advance-submit-btn" disabled={busy || maxAdv <= 0} type="submit" className="btn-blue w-full">{busy ? "Recording…" : "Record advance"}</button>
          </form>
        )}
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">History</div>
        {rows === null ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-slate-400 text-sm">No advances yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 text-sm">
            {rows.map(r => (
              <div key={r.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-medium">₹{Number(r.amount).toLocaleString("en-IN")}</span>
                  <span className="text-slate-400 text-xs ml-2">{r.month}{r.note ? ` · ${r.note}` : ""}</span>
                </div>
                <span className="text-[10px] text-slate-400">{r.given_by}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

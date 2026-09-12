import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { Clock, Check, X, Pencil, Loader2, RotateCcw } from "lucide-react";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const hhmm = (iso) => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

// Owner's overtime queue — every OT day waits here before it reaches the salary slip.
export function OvertimeApprovals({ onChanged }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState("pending");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [edit, setEdit] = useState({});
  const load = useCallback(async () => {
    try { const { data } = await api.get("/attendance/overtime", { params: { month, status } }); setData(data); }
    catch { setData({ records: [], pending_total: 0 }); }
  }, [month, status]);
  useEffect(() => { load(); }, [load]);

  const review = async (rec, action) => {
    setBusy(rec.id + action);
    try {
      const hours = edit[rec.id] !== undefined && edit[rec.id] !== "" ? Number(edit[rec.id]) : undefined;
      await pinApi.post(`/attendance/${rec.id}/overtime-review`, { action, ...(action === "approve" && hours !== undefined ? { hours } : {}) });
      toast.success(action === "approve" ? `Overtime approved${hours !== undefined ? ` at ${hours}h` : ""} for ${rec.staff_name}` : action === "reject" ? "Overtime rejected" : "Sent back to pending");
      setEdit(e => { const n = { ...e }; delete n[rec.id]; return n; });
      await load(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(null); }
  };

  const recs = data?.records || [];
  return (
    <div className="card-light p-4" data-testid="overtime-approvals">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-amber-600" />
        <h3 className="font-semibold text-slate-900 text-sm">Overtime approvals</h3>
        {data && status === "pending" && <span data-testid="overtime-pending-total" className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">{recs.length} pending · {inr(data.pending_total)}</span>}
        <div className="ml-auto flex items-center gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} data-testid="overtime-month" className="input-light !py-1 !text-xs w-36" />
          <select value={status} onChange={e => setStatus(e.target.value)} data-testid="overtime-status-filter" className="input-light !py-1 !text-xs w-32">
            {["pending", "approved", "rejected", "all"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">Only approved overtime is paid on the salary slip. Adjust the hours if a stylist stayed back for reasons other than clients.</p>
      {!data ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : recs.length === 0 ? (
        <p className="text-sm text-slate-400" data-testid="overtime-empty">No {status === "all" ? "" : status} overtime this month.</p>
      ) : (
        <div className="space-y-2">
          {recs.map(r => {
            const st = r.ot_status, paidH = r.ot_approved_hours ?? r.overtime_hours, paidPay = r.ot_approved_pay ?? r.overtime_pay;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2" data-testid={`overtime-row-${r.id}`}>
                <div className="min-w-[160px]">
                  <p className="text-sm font-semibold text-slate-900">{r.staff_name} <span className="text-slate-400 font-normal text-xs">{r.role}</span></p>
                  <p className="text-[11px] text-slate-500">{r.date} · out {hhmm(r.check_out_at)} (shift ends {r.shift_end}){r.auto_checked_out ? " · auto-closed" : ""}</p>
                </div>
                <div className="text-xs text-slate-700" data-testid={`overtime-amount-${r.id}`}>
                  <b>{r.overtime_hours}h</b> recorded · {inr(r.overtime_pay)} @ {inr(r.overtime_rate)}/h
                  {st === "approved" && (r.ot_approved_hours !== null && r.ot_approved_hours !== undefined && r.ot_approved_hours !== r.overtime_hours) && <span className="text-emerald-700"> → paid {paidH}h · {inr(paidPay)}</span>}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st === "approved" ? "bg-emerald-50 text-emerald-700" : st === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`} data-testid={`overtime-status-${r.id}`}>{st.toUpperCase()}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {st === "pending" && (<>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Pencil className="w-3 h-3" />
                      <input type="number" step="0.25" min="0" max="12" placeholder={String(r.overtime_hours)} value={edit[r.id] ?? ""} onChange={e => setEdit({ ...edit, [r.id]: e.target.value })}
                        data-testid={`overtime-hours-input-${r.id}`} className="input-light !py-0.5 !text-xs w-16" /> h
                    </span>
                    <button onClick={() => review(r, "approve")} disabled={!!busy} data-testid={`overtime-approve-${r.id}`} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white disabled:opacity-50">
                      {busy === r.id + "approve" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                    </button>
                    <button onClick={() => review(r, "reject")} disabled={!!busy} data-testid={`overtime-reject-${r.id}`} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 disabled:opacity-50"><X className="w-3 h-3" /> Reject</button>
                  </>)}
                  {st !== "pending" && <button onClick={() => review(r, "reset")} disabled={!!busy} data-testid={`overtime-reset-${r.id}`} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600"><RotateCcw className="w-3 h-3" /> Re-open</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

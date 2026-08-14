import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { ClipboardList, CheckCircle2, Trash2 } from "lucide-react";
import { PAY_LABELS } from "@/components/pos/payLabels";
import { confirmAsync } from "@/components/ConfirmDialog";

export function UnbilledPanel({ sym = "₹", isOwner = false }) {
  const [bills, setBills] = useState([]);
  const [payModes, setPayModes] = useState({});
  const [busyId, setBusyId] = useState("");

  const load = useCallback(() => {
    api.get("/invoices", { params: { status: "open" } }).then(r => setBills(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function complete(b) {
    setBusyId(b.id);
    try {
      const { data } = await api.post(`/invoices/${b.id}/complete`, { payment_mode: payModes[b.id] || "cash" });
      toast.success(`Bill ${b.invoice_no} completed ✓${data.points_earned ? ` · +${data.points_earned} pts` : ""}`);
      setBills(prev => prev.filter(x => x.id !== b.id));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't complete the bill");
    } finally { setBusyId(""); }
  }

  async function remove(b) {
    if (!await confirmAsync(`Delete open bill ${b.invoice_no} (${b.customer_name} · ${sym}${Number(b.total || 0).toFixed(0)})? This can't be undone.`)) return;
    setBusyId(b.id);
    try {
      await api.delete(`/invoices/${b.id}`);
      toast.success(`Bill ${b.invoice_no} deleted 🗑`);
      setBills(prev => prev.filter(x => x.id !== b.id));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't delete the bill");
    } finally { setBusyId(""); }
  }

  const pendingTotal = bills.reduce((s, b) => s + Number(b.total || 0), 0);

  return (
    <div className="card-light p-0 overflow-hidden" data-testid="report-unbilled-panel">
      <div className="p-4 flex items-center gap-2 border-b border-slate-100 flex-wrap">
        <ClipboardList className="w-4 h-4 text-amber-600" />
        <h3 className="font-playfair text-xl">Unbilled / Not Paid</h3>
        {bills.length > 0 ? (
          <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1" data-testid="unbilled-count">
            {bills.length} open · {sym}{pendingTotal.toLocaleString("en-IN")} pending
          </span>
        ) : (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1" data-testid="unbilled-clear">
            ✓ All bills paid
          </span>
        )}
        <span className="ml-auto text-[11px] text-slate-400">Owners get an end-of-day email if bills are left open</span>
      </div>
      {bills.length > 0 && (
        <div className="overflow-x-auto">
          <table className="luxe-table-light">
            <thead><tr><th>Invoice</th><th>Created</th><th>Customer</th><th className="text-right">Total</th><th>Collect via</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id} data-testid={`unbilled-row-${b.invoice_no}`}>
                  <td className="font-mono text-xs">{b.invoice_no}</td>
                  <td className="text-xs text-slate-500">
                    {new Date(b.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td>{b.customer_name}</td>
                  <td className="text-right font-bold text-slate-800">{sym}{Number(b.total || 0).toLocaleString("en-IN")}</td>
                  <td>
                    <select value={payModes[b.id] || "cash"} onChange={e => setPayModes(p => ({ ...p, [b.id]: e.target.value }))}
                      data-testid={`unbilled-pay-${b.invoice_no}`}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-amber-400">
                      {Object.entries(PAY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => complete(b)} disabled={busyId === b.id} data-testid={`unbilled-complete-${b.invoice_no}`}
                      className="inline-flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold rounded-lg px-3 py-1.5 hover:bg-emerald-500 disabled:opacity-50">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                    </button>
                    {isOwner && (
                      <button onClick={() => remove(b)} disabled={busyId === b.id} data-testid={`unbilled-delete-${b.invoice_no}`}
                        title="Delete this wrongly-created bill"
                        className="ml-2 inline-flex items-center gap-1 border border-rose-200 text-rose-600 text-xs font-bold rounded-lg px-2.5 py-1.5 hover:bg-rose-50 disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

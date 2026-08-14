import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { ClipboardList, ChevronDown, ChevronUp, CheckCircle2, Trash2 } from "lucide-react";
import { PAY_LABELS } from "@/components/pos/payLabels";

export function OpenBillsPanel({ sym = "₹", refreshKey = 0, onCompleted, canDelete = false }) {
  const [bills, setBills] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [payModes, setPayModes] = useState({});
  const [busyId, setBusyId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");

  const load = useCallback(() => {
    api.get("/invoices", { params: { status: "open" } })
      .then(r => setBills(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function complete(b) {
    setBusyId(b.id);
    try {
      const { data } = await api.post(`/invoices/${b.id}/complete`, { payment_mode: payModes[b.id] || "cash" });
      toast.success(`Bill ${b.invoice_no} completed ✓${data.points_earned ? ` · +${data.points_earned} pts` : ""}`);
      setBills(prev => prev.filter(x => x.id !== b.id));
      onCompleted?.(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't complete the bill");
    } finally { setBusyId(""); }
  }

  async function remove(b) {
    if (confirmDeleteId !== b.id) {
      setConfirmDeleteId(b.id);
      toast.warning(`Delete open bill ${b.invoice_no} (${b.customer_name})? Tap Delete again to confirm.`);
      setTimeout(() => setConfirmDeleteId(id => (id === b.id ? "" : id)), 5000);
      return;
    }
    setConfirmDeleteId("");
    setBusyId(b.id);
    try {
      await api.delete(`/invoices/${b.id}`);
      toast.success(`Bill ${b.invoice_no} deleted 🗑`);
      setBills(prev => prev.filter(x => x.id !== b.id));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't delete the bill");
    } finally { setBusyId(""); }
  }

  if (!bills.length) return null;

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-2xl overflow-hidden" data-testid="pos-open-bills-panel">
      <button onClick={() => setExpanded(e => !e)} data-testid="pos-open-bills-toggle"
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-amber-100/60 transition">
        <ClipboardList className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-bold text-amber-800">
          {bills.length} open bill{bills.length === 1 ? "" : "s"} waiting for payment
        </span>
        <span className="ml-auto text-xs text-amber-600 font-semibold flex items-center gap-1">
          {expanded ? <>Hide <ChevronUp className="w-3.5 h-3.5" /></> : <>View <ChevronDown className="w-3.5 h-3.5" /></>}
        </span>
      </button>
      {expanded && (
        <div className="divide-y divide-amber-200/70 border-t border-amber-200" data-testid="pos-open-bills-list">
          {bills.map(b => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-white/60" data-testid={`pos-open-bill-${b.invoice_no}`}>
              <span className="font-mono text-[11px] text-slate-500">{b.invoice_no}</span>
              <span className="text-sm font-semibold text-slate-800">{b.customer_name}</span>
              <span className="text-[11px] text-slate-400">
                {new Date(b.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="ml-auto text-sm font-bold text-slate-800">{sym}{Number(b.total || 0).toFixed(0)}</span>
              <select value={payModes[b.id] || "cash"} onChange={e => setPayModes(p => ({ ...p, [b.id]: e.target.value }))}
                data-testid={`pos-open-bill-pay-${b.invoice_no}`}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-amber-400">
                {Object.entries(PAY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <button onClick={() => complete(b)} disabled={busyId === b.id} data-testid={`pos-open-bill-complete-${b.invoice_no}`}
                className="inline-flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold rounded-lg px-3 py-1.5 hover:bg-emerald-500 disabled:opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5" /> {busyId === b.id ? "…" : "Complete"}
              </button>
              {canDelete && (
                <button onClick={() => remove(b)} disabled={busyId === b.id} data-testid={`pos-open-bill-delete-${b.invoice_no}`}
                  title="Delete this wrongly-created bill"
                  className={`inline-flex items-center gap-1 border text-xs font-bold rounded-lg px-2 py-1.5 disabled:opacity-50 ${confirmDeleteId === b.id ? "bg-rose-500 border-rose-500 text-white" : "border-rose-200 text-rose-600 hover:bg-rose-50"}`}>
                  <Trash2 className="w-3.5 h-3.5" />{confirmDeleteId === b.id && "Confirm?"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

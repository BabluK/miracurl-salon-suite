import { useState } from "react";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { FileClock, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export const UpdatedBillsCard = () => {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { data } = await pinApi.get("/invoice-edits");
      setEdits(data);
      setOpen(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't load");
    }
    setBusy(false);
  };

  const bulkDelete = async (scope) => {
    const label = scope === "all" ? "ALL edit records" : "records older than 30 days";
    if (!window.confirm(`Delete ${label}? The bills themselves are not affected.`)) return;
    try {
      const { data } = await pinApi.delete(`/invoice-edits/bulk?scope=${scope}`);
      toast.success(`${data.deleted} record(s) deleted`);
      const r = await pinApi.get("/invoice-edits");
      setEdits(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="updated-bills-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
          <FileClock className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Updated Bills (audit trail)</h2>
          <p className="text-xs text-slate-500 mt-1">Every post-billing edit is recorded — who changed it, when, and what changed. Protected by your Owner PIN (if set).</p>
        </div>
        <button onClick={() => (open ? setOpen(false) : load())} disabled={busy} data-testid="updated-bills-toggle"
          className="text-xs font-bold text-slate-600 border border-slate-200 rounded-xl px-4 py-2 inline-flex items-center gap-1.5 hover:bg-slate-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {open ? "Hide" : "View"}
        </button>
      </div>

      {open && edits && (
        <div className="mt-5 space-y-3">
          <div className="flex gap-2">
            <button onClick={() => bulkDelete("older_than_30d")} data-testid="updated-bills-delete-old"
              className="text-[11px] font-bold text-rose-500 border border-rose-200 rounded-lg px-3 py-1.5 inline-flex items-center gap-1 hover:bg-rose-50">
              <Trash2 className="w-3 h-3" /> Delete records older than 30 days
            </button>
            <button onClick={() => bulkDelete("all")} data-testid="updated-bills-delete-all"
              className="text-[11px] font-bold text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-50">Delete all</button>
          </div>
          {edits.length === 0 && <p className="text-xs text-slate-400 py-4 text-center" data-testid="updated-bills-empty">No bill edits recorded yet.</p>}
          {edits.map(e => (
            <div key={e.id} className="border border-slate-100 rounded-xl px-4 py-3 text-xs" data-testid={`updated-bill-${e.id}`}>
              <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
                <b className="font-mono">{e.invoice_no}</b>
                <span className="text-slate-500">{e.customer_name}</span>
                <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold">✎ {e.editor_name}</span>
                <span className="text-slate-400 ml-auto">{new Date(e.edited_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <div className="text-slate-500 mt-1.5">
                {e.before.total !== e.after.total && <span className="mr-3">Total: <s>{inr(e.before.total)}</s> → <b className="text-slate-700">{inr(e.after.total)}</b></span>}
                {e.before.payment_mode !== e.after.payment_mode && <span className="mr-3">Mode: <s>{e.before.payment_mode}</s> → <b className="text-slate-700 uppercase">{e.after.payment_mode}</b></span>}
                {JSON.stringify(e.before.items) !== JSON.stringify(e.after.items) && <span>Items changed ({e.before.items.length} → {e.after.items.length})</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

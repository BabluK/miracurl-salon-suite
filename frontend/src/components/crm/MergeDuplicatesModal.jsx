import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { X, GitMerge, Phone } from "lucide-react";
import { askConfirm } from "@/components/ConfirmDialog";

export function MergeDuplicatesModal({ onClose, onMerged }) {
  const [groups, setGroups] = useState(null);
  const [primary, setPrimary] = useState({}); // phone -> chosen primary id
  const [busy, setBusy] = useState("");

  const load = () => api.get("/customers/duplicates").then(({ data }) => {
    setGroups(data);
    setPrimary(Object.fromEntries(data.map(g => [g.phone, g.customers[0]?.id])));
  }).catch(() => setGroups([]));

  useEffect(() => { load(); }, []);

  function merge(g) {
    const pid = primary[g.phone];
    const keep = g.customers.find(c => c.id === pid);
    const others = g.customers.filter(c => c.id !== pid);
    askConfirm({
      title: `Merge ${g.customers.length} records into ${keep?.name}?`,
      message: `${others.map(o => o.name).join(", ")} will be merged into ${keep?.name}. All their bills, visits, wallet and points move over — nothing is lost. This can't be undone.`,
      confirmLabel: "Merge records", danger: true,
      action: async () => {
        setBusy(g.phone);
        try {
          const { data } = await api.post("/customers/merge", { primary_id: pid, duplicate_ids: others.map(o => o.id) });
          toast.success(`Merged ${data.merged} record${data.merged > 1 ? "s" : ""} into ${keep?.name} ✓`);
          onMerged?.();
          load();
        } catch (err) {
          const d = err.response?.data?.detail;
          toast.error(typeof d === "string" ? d : "Merge failed");
        } finally { setBusy(""); }
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()} data-testid="merge-duplicates-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-violet-500" /> Merge duplicate guests
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Same phone number saved more than once. Pick which record to keep — bills, visits, wallet & points all move to it.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="merge-duplicates-close-btn"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {groups === null && <p className="text-sm text-slate-400 text-center py-8">Scanning for duplicates…</p>}
          {groups?.length === 0 && <p className="text-sm text-slate-500 text-center py-8">🎉 No duplicate numbers found — your CRM is clean!</p>}
          {groups?.map(g => (
            <div key={g.phone} className="rounded-xl border border-slate-200 overflow-hidden" data-testid={`dup-group-${g.phone}`}>
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><Phone className="w-3 h-3 text-sky-500" /> {g.phone} · {g.customers.length} records</span>
                <button
                  data-testid={`merge-group-btn-${g.phone}`}
                  onClick={() => merge(g)}
                  disabled={busy === g.phone}
                  className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-bold hover:bg-violet-600 disabled:opacity-50 transition">
                  {busy === g.phone ? "Merging…" : "Merge into selected"}
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {g.customers.map(c => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50" data-testid={`dup-customer-${c.id}`}>
                    <input type="radio" name={`primary-${g.phone}`} checked={primary[g.phone] === c.id}
                      onChange={() => setPrimary(p => ({ ...p, [g.phone]: c.id }))}
                      className="accent-violet-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{c.name} {primary[g.phone] === c.id && <span className="text-[10px] font-bold text-violet-600 ml-1">KEEP THIS</span>}</div>
                      <div className="text-xs text-slate-400">{c.visits || 0} visits · ₹{Number(c.total_spent || 0).toLocaleString("en-IN")} spent · {c.loyalty_points || 0} pts{Number(c.wallet_balance) > 0 ? ` · ₹${c.wallet_balance} wallet` : ""}</div>
                    </div>
                    <span className="text-[10px] text-slate-300">{(c.created_at || "").slice(0, 10)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

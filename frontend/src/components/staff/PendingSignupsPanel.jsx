import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { UserCheck, UserX, BadgeCheck, Loader2 } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

export const PendingSignupsPanel = ({ onChanged }) => {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/tenants/staff/pending");
      setItems(data.pending || []);
    } catch { /* silent — panel hides itself */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = async (p) => {
    setBusyId(p.id);
    try {
      const { data } = await api.post(`/tenants/staff/${p.id}/attach`, { role: "staff" });
      toast.success(data.linked_staff
        ? `${p.name || p.email} approved & linked to staff profile "${data.linked_staff}" ✦`
        : `${p.name || p.email} approved — they now have staff access`);
      load(); onChanged?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Approve failed");
    } finally { setBusyId(""); }
  };

  const reject = async (p) => {
    if (!await confirmAsync(`Reject and delete the sign-up from ${p.email}?`)) return;
    setBusyId(p.id);
    try {
      await api.delete(`/tenants/staff/pending/${p.id}`);
      toast.success("Sign-up rejected");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Reject failed");
    } finally { setBusyId(""); }
  };

  if (items.length === 0) return null;

  return (
    <div className="card-light border-amber-200 bg-amber-50/40" data-testid="pending-signups-panel">
      <div className="flex items-center gap-2 mb-1">
        <UserCheck className="w-4 h-4 text-amber-600" />
        <h3 className="font-playfair text-xl">Pending sign-ups</h3>
        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold inline-flex items-center justify-center">{items.length}</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">People who created an account and are waiting for your approval. Approve only those you recognise — they'll get staff access to your salon.</p>
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 bg-white border border-amber-200 rounded-xl px-4 py-3" data-testid={`pending-signup-row-${p.id}`}>
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-medium">{p.name || "—"} <span className="text-slate-400 font-normal">· {p.email}</span></div>
              {p.matched_staff ? (
                <div className="text-[11px] text-emerald-700 inline-flex items-center gap-1 mt-0.5" data-testid={`pending-signup-match-${p.id}`}>
                  <BadgeCheck className="w-3 h-3" /> Email matches your staff profile: <b>{p.matched_staff.name}</b> ({p.matched_staff.role}) — approving links them automatically
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 mt-0.5">No matching staff profile — approving gives basic staff access only</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => approve(p)} disabled={busyId === p.id} data-testid={`pending-signup-approve-${p.id}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50">
                {busyId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />} Approve
              </button>
              <button onClick={() => reject(p)} disabled={busyId === p.id} data-testid={`pending-signup-reject-${p.id}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50">
                <UserX className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

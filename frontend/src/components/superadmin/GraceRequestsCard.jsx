import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { confirmAsync, promptAsync } from "@/components/ConfirmDialog";
import { HeartHandshake, CheckCircle2, Ban } from "lucide-react";

export function GraceRequestsCard() {
  const [items, setItems] = useState([]);

  const load = useCallback(() => {
    api.get("/super-admin/grace-requests").then(r => setItems(r.data.items || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = items.filter(i => i.status === "pending");
  if (pending.length === 0) return null;

  async function decide(req, approve) {
    if (approve) {
      const days = await promptAsync(`Grant how many grace days to ${req.tenant_name}?`, "7");
      if (days === null) return;
      const n = parseInt(days, 10);
      if (!n || n < 1 || n > 90) return toast.error("Enter 1–90 days");
      try {
        const { data } = await api.post(`/super-admin/grace-requests/${req.id}/decide`, { approve: true, days: n });
        toast.success(`Grace granted until ${data.grace_until} ✦`);
        load();
      } catch (e) { toast.error(e.response?.data?.detail || "Couldn't approve"); }
    } else {
      if (!await confirmAsync(`Reject ${req.tenant_name}'s grace request?`)) return;
      try {
        await api.post(`/super-admin/grace-requests/${req.id}/decide`, { approve: false, days: 1 });
        toast.success("Request rejected");
        load();
      } catch (e) { toast.error(e.response?.data?.detail || "Couldn't reject"); }
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6" data-testid="grace-requests-card">
      <div className="flex items-center gap-2 mb-3">
        <HeartHandshake className="w-4 h-4 text-amber-600" />
        <h3 className="font-semibold text-slate-800">Grace Requests</h3>
        <span className="text-[11px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">{pending.length} pending</span>
      </div>
      <div className="space-y-2">
        {pending.map(req => (
          <div key={req.id} className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-amber-100 px-4 py-3" data-testid={`grace-req-${req.id}`}>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-bold text-slate-800">{req.tenant_name} <span className="text-xs font-normal text-slate-400">({req.slug})</span></p>
              <p className="text-[11px] text-slate-500">
                Plan {req.plan || "—"} · expired {req.end_date ? String(req.end_date).slice(0, 10) : "—"} · requested {new Date(req.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} by {req.requested_by}
              </p>
            </div>
            <button onClick={() => decide(req, true)} data-testid={`grace-approve-${req.id}`}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
            <button onClick={() => decide(req, false)} data-testid={`grace-reject-${req.id}`}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-50">
              <Ban className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/share";
import { GitBranch, MessageCircle, X } from "lucide-react";

// Owner-side widget: pending branch-switch requests with the OTP to share.
export function BranchSwitchApprovals() {
  const [reqs, setReqs] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => api.get("/branch-switch/pending")
      .then(r => { if (alive) setReqs(r.data || []); }).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!reqs.length) return null;

  async function deny(r) {
    try {
      await api.post(`/branch-switch/${r.id}/deny`);
      setReqs(list => list.filter(x => x.id !== r.id));
      toast.success("Request denied");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't deny"); }
  }

  return (
    <div className="dash-cream-card rounded-3xl p-4 sm:p-5" data-testid="branch-switch-approvals">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <GitBranch className="w-4 h-4" /> Branch switch approvals waiting
      </div>
      <div className="mt-3 space-y-2">
        {reqs.map(r => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-amber-200 px-3 py-2.5" data-testid={`switch-req-${r.id}`}>
            <div className="text-xs text-slate-700 flex-1 min-w-[180px]">
              <b>{r.requester_name}</b> · {r.requester_position} · {r.requester_phone}
              <div className="text-[11px] text-slate-500 mt-0.5">wants to switch to <b>{r.branch || "All branches"}</b></div>
            </div>
            <div className="font-mono text-lg font-bold tracking-[0.3em] text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-1" data-testid={`switch-otp-${r.id}`}>
              {r.otp}
            </div>
            <button data-testid={`switch-share-${r.id}`}
              onClick={() => { openWhatsApp(`Branch switch OTP: ${r.otp} (valid 10 min)`, r.requester_phone.replace(/\D/g, "")); }}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium">
              <MessageCircle className="w-3.5 h-3.5" /> Share OTP
            </button>
            <button data-testid={`switch-deny-${r.id}`} onClick={() => deny(r)} title="Deny this request"
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-amber-700 mt-2">Only share the OTP if you recognise the person. Requests expire in 10 minutes.</p>
    </div>
  );
}

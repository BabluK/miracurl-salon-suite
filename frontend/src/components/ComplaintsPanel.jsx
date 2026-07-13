import { useEffect, useState, useCallback } from "react";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { ShieldAlert, Lock, CheckCircle2, Star } from "lucide-react";

export const ComplaintsPanel = () => {
  const [unlocked, setUnlocked] = useState(false);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await pinApi.get("/complaints");
      setList(data); setUnlocked(true);
    } catch (e) {
      if (e.response?.status !== 403) toast.error("Couldn't load complaints");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    // try silently — if no PIN is set on the tenant, it opens without asking
  }, []);

  const resolve = async (cid) => {
    try {
      await pinApi.post(`/complaints/${cid}/resolve`, {});
      toast.success("Marked resolved");
      load();
    } catch { toast.error("Failed"); }
  };

  const open = list.filter(c => c.status === "open");

  return (
    <div className="card-light border-amber-200" data-testid="complaints-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" />
          <h3 className="font-playfair text-xl">Customer Complaints</h3>
          {unlocked && open.length > 0 && (
            <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{open.length} open</span>
          )}
        </div>
        {!unlocked && (
          <button onClick={load} disabled={busy} className="btn-slate text-xs flex items-center gap-1.5" data-testid="complaints-unlock-btn">
            <Lock className="w-3 h-3" /> {busy ? "Unlocking…" : "Unlock with Owner PIN"}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-1">Private feedback from guests who rated 3★ or below — never published anywhere. Owner PIN protected.</p>

      {unlocked && (
        <div className="mt-4 space-y-3">
          {list.map(c => (
            <div key={c.id} className={`border rounded-xl p-4 ${c.status === "open" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50/50 opacity-70"}`} data-testid={`complaint-${c.id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{c.customer_name}</span>
                    <span className="inline-flex items-center gap-0.5 text-xs text-red-500 font-bold">{c.rating}<Star className="w-3 h-3 fill-red-400 text-red-400" /></span>
                    <span className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  </div>
                  {c.disappointed_service && (
                    <div className="text-xs mt-1"><span className="text-slate-500">Disappointed with:</span> <b className="text-red-600">{c.disappointed_service}</b></div>
                  )}
                  {c.staff_name && <div className="text-[11px] text-slate-400 mt-0.5">Served by {c.staff_name}</div>}
                  {c.message && <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">&ldquo;{c.message}&rdquo;</p>}
                </div>
                {c.status === "open" ? (
                  <button onClick={() => resolve(c.id)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600" data-testid={`resolve-complaint-${c.id}`}>Mark resolved</button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Resolved</span>
                )}
              </div>
            </div>
          ))}
          {list.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No complaints — your guests are happy! 🎉</p>}
        </div>
      )}
    </div>
  );
};

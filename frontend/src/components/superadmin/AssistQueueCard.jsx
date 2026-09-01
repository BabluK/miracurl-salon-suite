import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { HandHelping, Phone, MessageCircle, Check, Undo2 } from "lucide-react";

const BADGE = {
  new: "bg-rose-50 text-rose-600 border-rose-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function AssistQueueCard() {
  const [items, setItems] = useState([]);
  const [showDone, setShowDone] = useState(false);

  const load = () => api.get("/super-admin/assist-requests").then(r => setItems(r.data.items || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const setStatus = async (r, status) => {
    setItems(xs => xs.map(x => x.id === r.id ? { ...x, status } : x));
    try {
      await api.put(`/super-admin/assist-requests/${r.id}/status`, { status });
      if (status === "done") toast.success(`${r.business_name || r.email} marked done ✅`);
    } catch { toast.error("Couldn't update"); load(); }
  };

  const open = items.filter(i => i.status !== "done");
  const done = items.filter(i => i.status === "done");
  if (items.length === 0) return null;
  const visible = showDone ? items : open;

  return (
    <div className="card-light !p-5 border-l-4 border-l-violet-400" data-testid="assist-queue-card">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <HandHelping className="w-4 h-4 text-violet-500" /> Onboard-me requests
          {open.length > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-bold">{open.length} waiting</span>}
        </h3>
        {done.length > 0 && (
          <button onClick={() => setShowDone(v => !v)} data-testid="assist-toggle-done-btn"
            className="text-[11px] text-slate-400 hover:text-slate-600 underline">
            {showDone ? "Hide completed" : `Show completed (${done.length})`}
          </button>
        )}
      </div>
      {visible.length === 0 && <p className="text-xs text-slate-400 py-2">All caught up — nothing waiting 🎉</p>}
      <div className="divide-y divide-slate-100">
        {visible.map(r => (
          <div key={r.id} className="py-2.5 flex items-center gap-3 flex-wrap" data-testid={`assist-row-${r.id}`}>
            <span className="text-base">{r.business_type === "restaurant" ? "🍽️" : "💇"}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">
                {r.business_name || "Unnamed business"}
                <span className={`ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${BADGE[r.status] || BADGE.new}`}>{r.status}</span>
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {r.email}{r.phone ? ` · ${r.phone}` : ""}{r.opening_date ? ` · opens ${r.opening_date}` : ""} · asked {String(r.created_at || "").slice(0, 10)}
              </p>
            </div>
            {r.phone && (
              <a href={`tel:${r.phone}`} onClick={() => r.status === "new" && setStatus(r, "contacted")}
                data-testid={`assist-call-${r.id}`} title="Call them"
                className="p-2 rounded-full bg-sky-50 text-sky-600 hover:bg-sky-100"><Phone className="w-4 h-4" /></a>
            )}
            {r.phone && (
              <a href={`https://wa.me/91${String(r.phone).replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hi! This is the Miracurl team 👋 You asked us to help set up ${r.business_name || "your business"} — when's a good time for a quick call?`)}`}
                target="_blank" rel="noopener noreferrer" onClick={() => r.status === "new" && setStatus(r, "contacted")}
                data-testid={`assist-wa-${r.id}`} title="WhatsApp them"
                className="p-2 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><MessageCircle className="w-4 h-4" /></a>
            )}
            {r.status !== "done" ? (
              <button onClick={() => setStatus(r, "done")} data-testid={`assist-done-${r.id}`}
                className="px-3 py-1.5 rounded-full bg-slate-800 text-white text-[11px] font-bold hover:bg-slate-700 inline-flex items-center gap-1">
                <Check className="w-3 h-3" /> Done
              </button>
            ) : (
              <button onClick={() => setStatus(r, "new")} data-testid={`assist-reopen-${r.id}`}
                className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-500 text-[11px] hover:bg-slate-50 inline-flex items-center gap-1">
                <Undo2 className="w-3 h-3" /> Reopen
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

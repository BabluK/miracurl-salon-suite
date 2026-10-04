import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw, Trash2, MessageCircle, Zap, Smartphone } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const STATUS_STYLE = {
  read: "bg-emerald-100 text-emerald-700", delivered: "bg-emerald-50 text-emerald-700", sent: "bg-sky-50 text-sky-700",
  accepted: "bg-slate-100 text-slate-600", failed: "bg-rose-100 text-rose-700", sent_manually: "bg-amber-50 text-amber-700",
};
const STATUS_LABEL = { read: "Read ✓✓", delivered: "Delivered ✓✓", sent: "Sent ✓", accepted: "Queued at Meta", failed: "Failed", sent_manually: "Sent manually" };
const fmt = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

// HQ → Lead Agent: every WhatsApp outreach (Meta one-click + manual) with live delivery status so nothing is lost.
export function WaOutreachHistory({ refreshKey = 0 }) {
  const [d, setD] = useState(null);
  const [channel, setChannel] = useState("");
  const load = useCallback(() => api.get("/super-admin/wa-outreach/history", { params: { channel } }).then(r => setD(r.data)).catch(() => setD({ items: [], counts: {} })), [channel]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const remove = async (id) => {
    try { await api.delete(`/super-admin/wa-outreach/history/${encodeURIComponent(id)}`); load(); } catch { toast.error("Couldn't delete"); }
  };
  if (!d) return null;
  const c = d.counts || {};
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3" data-testid="wa-outreach-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><History className="w-4 h-4 text-emerald-500" /> WhatsApp outreach history</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            <span data-testid="wa-history-count-meta">{c.meta || 0} via Meta</span> · <span data-testid="wa-history-count-manual">{c.manual || 0} manual</span> · {c.replied || 0} replied
            {c.not_on_wa > 0 && <span className="text-rose-500"> · {c.not_on_wa} not on WhatsApp</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
            {[["", "All"], ["meta", "Meta"], ["manual", "Manual"]].map(([k, l]) => (
              <button key={k} onClick={() => setChannel(k)} data-testid={`wa-history-filter-${k || "all"}`}
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${channel === k ? "bg-white shadow text-emerald-600" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          <button onClick={load} data-testid="wa-history-refresh" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Refresh delivery status"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {d.items.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center" data-testid="wa-history-empty">No WhatsApp outreach yet — run a WhatsApp Blast and every send lands here with its delivery status.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-1.5 pr-3">When</th><th className="pr-3">Business</th><th className="pr-3">Phone</th><th className="pr-3">Channel</th><th className="pr-3">Status</th><th className="pr-3">Reply</th><th className="pr-3">By</th><th />
            </tr></thead>
            <tbody>
              {d.items.map(r => (
                <tr key={r.id} className="border-t border-slate-100" data-testid={`wa-history-row-${r.lead_id}`}>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{fmt(r.created_at)}</td>
                  <td className="pr-3 font-semibold text-slate-800 whitespace-nowrap">{r.vertical === "restaurant" ? "🍽️" : "💇"} {r.lead_name}<span className="text-slate-400 font-normal"> · {r.city || "—"}</span></td>
                  <td className="pr-3 font-mono text-slate-600 whitespace-nowrap">+{r.phone}</td>
                  <td className="pr-3 whitespace-nowrap">
                    {r.channel === "meta"
                      ? <span className="inline-flex items-center gap-1 text-emerald-700"><Zap className="w-3 h-3" /> Meta</span>
                      : <span className="inline-flex items-center gap-1 text-amber-700"><Smartphone className="w-3 h-3" /> Manual</span>}
                  </td>
                  <td className="pr-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[r.status] || "bg-slate-100 text-slate-600"}`} data-testid={`wa-history-status-${r.lead_id}`}>{STATUS_LABEL[r.status] || r.status}</span>
                    {r.error && <div className="text-[10px] text-rose-500 mt-0.5 max-w-[220px]">{r.error}</div>}
                  </td>
                  <td className="pr-3 max-w-[200px] truncate text-slate-600" title={r.reply || ""}>{r.replied_at ? <span className="inline-flex items-center gap-1 text-emerald-600"><MessageCircle className="w-3 h-3" /> {r.reply || "Replied"}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="pr-3 text-slate-400 whitespace-nowrap">{(r.by || "").split("@")[0]}</td>
                  <td><button onClick={() => remove(r.id)} data-testid={`wa-history-delete-${r.lead_id}`} className="p-1 rounded text-slate-300 hover:text-rose-500" title="Remove entry"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

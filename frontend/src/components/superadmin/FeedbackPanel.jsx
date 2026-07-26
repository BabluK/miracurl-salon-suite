import { useEffect, useState, useCallback } from "react";
import { Star, Loader2, HeartHandshake, MessageCircleWarning } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const Stars = ({ n }) => (
  <span className="inline-flex gap-0.5">
    {[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-3.5 h-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />)}
  </span>
);

export function FeedbackPanel() {
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(() => {
    api.get("/super-admin/feedback-requests").then(r => setData(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const followUp = async (fr) => {
    setBusyId(fr.id);
    try {
      const { data: d } = await api.post(`/super-admin/feedback-requests/${fr.id}/follow-up`);
      toast.success(d.email_sent ? "Check-in email sent to the owner 💛" : "Marked as followed up");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't follow up"); }
    finally { setBusyId(""); }
  };

  if (!data) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 text-slate-300 animate-spin" /></div>;
  const s = data.stats || {};

  return (
    <div className="space-y-5" data-testid="feedback-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-500 flex items-center justify-center"><HeartHandshake className="w-5 h-5" /></span>
          Feedback Dashboard
        </h1>
        <p className="text-slate-500 text-sm mt-1">Every rating your salons gave after resolved tickets — 4★+ with comments are live on the landing page.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ["Average score", s.avg_rating ? `${s.avg_rating} ★` : "—", "text-amber-500"],
          ["Links sent", s.total || 0, "text-slate-700"],
          ["Responses", s.submitted || 0, "text-sky-600"],
          ["Published", s.published || 0, "text-emerald-600"],
          ["Needs follow-up", s.pending_followup || 0, s.pending_followup ? "text-rose-600" : "text-slate-400"],
        ].map(([label, val, cls]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4" data-testid={`feedback-stat-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
            <div className={`text-2xl font-bold ${cls}`}>{val}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 shadow-sm overflow-hidden">
        {(data.items || []).length === 0 && (
          <div className="p-10 text-center text-sm text-slate-400">No feedback requests yet — send one from HQ Inbox after resolving a ticket 💛</div>
        )}
        {(data.items || []).map(fr => (
          <div key={fr.id} className="px-4 py-3 flex items-start gap-3" data-testid={`feedback-row-${fr.id}`}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800">
                {fr.tenant_name}
                {fr.context && <span className="text-[10px] text-slate-400 font-normal ml-2">· {fr.context}</span>}
              </div>
              {fr.status === "submitted" ? (
                <div className="mt-1">
                  <Stars n={fr.rating || 0} />
                  {fr.comment && <p className="text-xs text-slate-500 mt-1 italic">"{fr.comment}" — {fr.responder_name || "Owner"}</p>}
                </div>
              ) : (
                <span className="text-[11px] text-slate-400">Awaiting response…</span>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="text-[10px] text-slate-400">{(fr.submitted_at || fr.created_at || "").slice(0, 10)}</span>
              {fr.status === "submitted" && fr.rating <= 3 && !fr.followed_up && (
                <button onClick={() => followUp(fr)} disabled={busyId === fr.id} data-testid={`feedback-followup-${fr.id}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">
                  {busyId === fr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircleWarning className="w-3 h-3" />} Follow up
                </button>
              )}
              {fr.followed_up && <span className="text-[10px] text-emerald-600 font-bold">✓ Followed up</span>}
              {fr.status === "submitted" && fr.rating >= 4 && (fr.comment || "").trim() && (
                <span className="text-[10px] text-emerald-600 font-semibold">🌟 On landing page</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

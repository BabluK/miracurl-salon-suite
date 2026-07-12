import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Star, Send, MessageCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function ReviewRequestsCard() {
  const [enabled, setEnabled] = useState(true);
  const [delay, setDelay] = useState(3);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/settings/review-requests").then(r => { setEnabled(r.data.enabled); setDelay(r.data.delay_hours); }).catch(() => {});
    api.get("/reviews/pending-requests").then(r => setPending(r.data.items)).catch(() => {});
  }, []);

  const toggle = async (v) => {
    setEnabled(v);
    try { await api.put("/settings/review-requests", { enabled: v }); toast.success(v ? "Auto review requests ON ✦" : "Auto review requests off"); }
    catch { setEnabled(!v); toast.error("Couldn't save"); }
  };

  const sendNow = async () => {
    setBusy(true);
    try {
      const r = await api.post("/reviews/request-now");
      toast.success(`Review request emails sent: ${r.data.sent}${r.data.failed ? ` · failed: ${r.data.failed}` : ""}`);
      api.get("/reviews/pending-requests").then(x => setPending(x.data.items));
    } catch { toast.error("Couldn't send"); }
    setBusy(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-6" data-testid="review-requests-card">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> Ask guests to rate their visit</h2>
          <p className="text-xs text-slate-500 mt-1">Automatic email ~{delay}h after each completed appointment. More genuine reviews = more bookings.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{enabled ? "Auto ON" : "Auto OFF"}</span>
          <Switch checked={enabled} onCheckedChange={toggle} data-testid="review-requests-toggle" />
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Waiting for a review ({pending.length})</p>
            <button onClick={sendNow} disabled={busy} data-testid="review-requests-send-now"
              className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[11px] font-semibold flex items-center gap-1.5 hover:bg-slate-700 disabled:opacity-50">
              <Send className="w-3 h-3" /> {busy ? "Sending…" : "Email all now"}
            </button>
          </div>
          <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
            {pending.map(p => (
              <div key={p.appointment_id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5" data-testid={`review-pending-${p.appointment_id}`}>
                <span className="font-medium text-slate-700 truncate">{p.customer_name}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{(p.scheduled_at || "").slice(0, 16).replace("T", " ")}</span>
                <span className="ml-auto flex items-center gap-1.5 shrink-0">
                  {p.wa_link && (
                    <a href={p.wa_link} target="_blank" rel="noreferrer" data-testid={`review-wa-${p.appointment_id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-semibold hover:bg-emerald-600">
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </a>
                  )}
                  {!p.email && !p.wa_link && <span className="text-[10px] text-slate-400">no contact</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

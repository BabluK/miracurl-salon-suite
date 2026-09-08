import { useEffect, useState } from "react";
import { Copy, RefreshCw, Webhook } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const RESULT_TONE = (r = "") => r.startsWith("error") ? "bg-rose-100 text-rose-700"
  : r.includes("activated") || r.includes("settled") || r.includes("credited") ? "bg-emerald-100 text-emerald-700"
  : r.includes("refund") || r.includes("failed") ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";

export function WebhookHealthCard() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { const r = await api.get("/super-admin/razorpay/webhook-status"); setD(r.data); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't load webhook status"); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  if (!d) return null;
  const copy = (v) => { navigator.clipboard?.writeText(v); toast.success("Copied"); };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" data-testid="webhook-health-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Webhook className="w-4 h-4 text-sky-600" /> Razorpay webhook — auto reconciliation</h3>
          <p className="text-xs text-slate-500 mt-0.5">Payments captured, failed or refunded in Razorpay update subscriptions here automatically — even when the owner closes the browser before confirmation.</p>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="webhook-configured-badge" className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${d.configured ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {d.configured ? "● Secret configured" : "○ Secret missing"}
          </span>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${d.live_mode ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-700"}`}>{d.live_mode ? "LIVE" : "TEST"}</span>
          <button onClick={load} disabled={busy} data-testid="webhook-refresh-btn" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /></button>
        </div>
      </div>
      <div className="mt-3 grid sm:grid-cols-3 gap-3 text-xs">
        <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Webhook URL (Razorpay → Settings → Webhooks)</div>
          <div className="flex items-center gap-2 mt-1"><code className="font-mono text-slate-800 truncate" data-testid="webhook-url">{d.url}</code>
            <button onClick={() => copy(d.url)} className="text-sky-600 hover:text-sky-700 shrink-0" data-testid="webhook-url-copy"><Copy className="w-3.5 h-3.5" /></button></div>
          <div className="text-[10px] text-slate-400 mt-1">Events: {d.events.join(" · ")}</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Last event</div>
          <div className="text-slate-800 font-semibold mt-1" data-testid="webhook-last-event">{d.last_event_at ? new Date(d.last_event_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "none yet"}</div>
          <div className="text-[10px] text-slate-400 mt-1">{Object.entries(d.counts || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</div>
        </div>
      </div>
      {d.recent?.length > 0 && (
        <div className="mt-3 space-y-1" data-testid="webhook-recent-events">
          {d.recent.slice(0, 8).map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
              <span className="font-mono text-slate-800">{ev.event_type}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${RESULT_TONE(ev.result)}`}>{ev.result}</span>
              {ev.amount ? <span>₹{Number(ev.amount).toLocaleString("en-IN")}</span> : null}
              <span className="font-mono text-[10px] text-slate-400 truncate max-w-[160px]">{ev.order_id || ev.payment_id}</span>
              <span className="text-slate-400 ml-auto">{new Date(ev.received_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

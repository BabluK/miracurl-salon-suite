import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { HeartHandshake, X, MessageCircle, Sparkles, PartyPopper } from "lucide-react";

export function WinbackNudges() {
  const { tenant } = useAuth();
  const [data, setData] = useState(null);
  const [auto, setAuto] = useState(null);

  const [sendingAll, setSendingAll] = useState(false);
  const load = () => api.get("/winback/nudges").then(r => setData(r.data)).catch(() => {});
  useEffect(() => {
    load();
    api.get("/winback/auto").then(r => setAuto(r.data.enabled)).catch(() => {});
  }, []);

  if (!data || (data.nudges.length === 0 && !data.wins_count)) return null;

  const fmt = (n) => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: tenant?.currency || "INR", maximumFractionDigits: 0 }).format(n); }
    catch { return `₹${Math.round(n).toLocaleString("en-IN")}`; }
  };

  const toggleAuto = async () => {
    const next = !auto;
    setAuto(next);
    try {
      await api.put("/winback/auto", { enabled: next });
      toast.success(next
        ? "Auto win-back ON ✦ Mira will email lapsed guests a personal comeback offer every day"
        : "Auto win-back turned off");
    } catch { setAuto(!next); toast.error("Couldn't update"); }
  };

  const ack = async (cust, action) => {
    setData(d => ({ ...d, nudges: d.nudges.filter(n => n.id !== cust.id), total_lapsed: d.total_lapsed - 1 }));
    try { await api.post(`/winback/nudges/${cust.id}/ack`, { action }); } catch { /* silent */ }
  };

  const nudge = (cust) => {
    const phone = (cust.phone || "").replace(/\D/g, "").slice(-10);
    if (!phone) { toast.error("No phone number on file for this customer"); return; }
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(cust.message)}`, "_blank", "noopener");
    ack(cust, "contacted");
    toast.success(`WhatsApp opened for ${cust.name} — nudge marked as sent`);
  };

  return (
    <div className="dash-cream-card rounded-3xl p-5" data-testid="winback-nudges-card">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center"><HeartHandshake className="w-4 h-4 text-rose-500" /></span>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Win them back 💌</h3>
            <p className="text-[11px] text-slate-500">
              {data.total_lapsed > 0
                ? <>{data.total_lapsed} guest{data.total_lapsed === 1 ? "" : "s"} haven&apos;t visited in {data.winback_days}+ days</>
                : "All your guests are visiting regularly ✨"}
            </p>
          </div>
        </div>
        {data.total_lapsed > 0 && (
          <button data-testid="winback-send-all" disabled={sendingAll}
            onClick={async () => {
              if (!window.confirm(`Send a win-back WhatsApp to all ${data.total_lapsed} lapsed guests from your salon number? Mira sends one every 30–45s (max daily limit applies).`)) return;
              setSendingAll(true);
              try {
                const { data: r } = await api.post("/winback/blast", { days: data.winback_days || 45, limit: 100 });
                toast.success(r.queued ? `Queued ${r.queued} win-back messages — sending gradually from your WhatsApp ✦` : `Sent ${r.sent} messages`);
              } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send"); }
              finally { setSendingAll(false); }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
            <Send className="w-3.5 h-3.5" /> {sendingAll ? "Queuing…" : `Send all (${Math.min(100, data.total_lapsed)})`}
          </button>
        )}
        {auto !== null && (
          <button onClick={toggleAuto} data-testid="winback-auto-toggle"
            className={`flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-xl border text-left transition-colors ${
              auto ? "bg-rose-500 border-rose-500 text-white shadow-sm shadow-rose-200" : "bg-rose-50/60 border-rose-200 text-slate-600 hover:border-rose-400"}`}>
            <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${auto ? "bg-white/30" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${auto ? "left-3.5" : "left-0.5"}`} />
            </span>
            <span>
              <span className="block text-[11px] font-bold leading-tight"><Sparkles className="w-3 h-3 inline -mt-0.5" /> Auto win-back {auto ? "ON" : "OFF"}</span>
              <span className={`block text-[9.5px] leading-tight ${auto ? "text-rose-100" : "text-slate-400"}`}>Mira emails a comeback offer daily</span>
            </span>
          </button>
        )}
      </div>

      {data.wins_count > 0 && (
        <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3" data-testid="winback-wins-banner">
          <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold">
            <PartyPopper className="w-4 h-4 text-emerald-600" />
            {data.wins_count} guest{data.wins_count === 1 ? "" : "s"} came back after your nudges — {fmt(data.wins_revenue)} recovered 🎉
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {data.wins.map(w => (
              <span key={w.customer_id} data-testid={`winback-win-${w.customer_id}`} className="text-[11px] text-emerald-700">
                ✓ <b>{w.name}</b> returned {w.returned_at} · {fmt(w.spent)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 mt-2">
        {data.nudges.map(c => (
          <div key={c.id} className="py-2.5 flex items-center gap-3" data-testid={`winback-nudge-${c.id}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
              <p className="text-[11px] text-slate-500">Last visit {c.days_since} days ago{c.phone ? ` · ${c.phone}` : ""}</p>
            </div>
            <button onClick={() => nudge(c)} data-testid={`winback-whatsapp-btn-${c.id}`}
              title="Opens WhatsApp with a personalized 15%-off comeback message + booking link"
              className="px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" /> Nudge
            </button>
            <button onClick={() => ack(c, "dismissed")} data-testid={`winback-dismiss-btn-${c.id}`}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors" title="Dismiss for 30 days">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

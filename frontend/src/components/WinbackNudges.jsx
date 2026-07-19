import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { HeartHandshake, X, MessageCircle, Sparkles } from "lucide-react";

export function WinbackNudges() {
  const [data, setData] = useState(null);
  const [auto, setAuto] = useState(null);

  const load = () => api.get("/winback/nudges").then(r => setData(r.data)).catch(() => {});
  useEffect(() => {
    load();
    api.get("/winback/auto").then(r => setAuto(r.data.enabled)).catch(() => {});
  }, []);

  if (!data || data.nudges.length === 0) return null;

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
    <div className="bg-white rounded-2xl border border-rose-200 p-5 shadow-sm" data-testid="winback-nudges-card">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center"><HeartHandshake className="w-4 h-4 text-rose-500" /></span>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Win them back 💌</h3>
            <p className="text-[11px] text-slate-500">{data.total_lapsed} customer{data.total_lapsed === 1 ? "" : "s"} haven&apos;t visited in {data.winback_days}+ days</p>
          </div>
        </div>
        {auto !== null && (
          <button onClick={toggleAuto} data-testid="winback-auto-toggle"
            title="Mira emails lapsed guests a personal comeback offer daily (max 15/day, 30-day cooldown per guest)"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
              auto ? "bg-rose-500 border-rose-500 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-rose-300"}`}>
            <Sparkles className="w-3 h-3" /> Auto {auto ? "ON" : "OFF"}
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100 mt-2">
        {data.nudges.map(c => (
          <div key={c.id} className="py-2.5 flex items-center gap-3" data-testid={`winback-nudge-${c.id}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
              <p className="text-[11px] text-slate-500">Last visit {c.days_since} days ago{c.phone ? ` · ${c.phone}` : ""}</p>
            </div>
            <button onClick={() => nudge(c)} data-testid={`winback-whatsapp-btn-${c.id}`}
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

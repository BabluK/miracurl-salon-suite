import { useEffect, useState } from "react";
import { SmsPacksCard } from "./SmsPacksCard";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, Coins, ShieldCheck } from "lucide-react";

export const WhatsAppLinkCard = () => {
  const [st, setSt] = useState(null);
  const [camps, setCamps] = useState(null);
  const load = () => Promise.all([api.get("/whatsapp-link/status"), api.get("/whatsapp-link/campaigns")])
    .then(([a, b]) => { setSt(a.data); setCamps(b.data); }).catch(() => setSt({ available: false }));
  useEffect(() => { load(); }, []);
  if (!st) return null;
  const usage = camps?.usage;
  const saveCap = async (v) => {
    try { await api.put("/whatsapp-link/daily-cap", { daily_cap: v }); toast.success(`Daily limit set to ${v}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't save limit"); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4" data-testid="whatsapp-link-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><MessageCircle className="w-5 h-5" /></div>
          <div>
            <h3 className="font-semibold text-slate-800">WhatsApp messaging</h3>
            <p className="text-xs text-slate-500">Official Meta channel · sent as <b>Miracurl AI Salon Suite</b> ({st.sender}) with your salon name & poster</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" data-testid="whatsapp-link-status">
          <ShieldCheck className="w-3.5 h-3.5" /> {st.available ? "Verified business account · active" : "Not configured"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="whatsapp-credits-box">
          <div className="text-[11px] uppercase tracking-widest text-amber-700 font-semibold flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> WhatsApp credits</div>
          <div className="text-3xl font-bold text-slate-900 mt-1" data-testid="whatsapp-credits">{st.credits ?? 0}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">1 credit = 1 message (confirmation, reminder, campaign, birthday, review)</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Sent today</div>
          <div className="text-3xl font-bold text-slate-900 mt-1" data-testid="whatsapp-usage-count">{usage ? `${usage.sent} / ${usage.cap}` : "—"}</div>
          <label className="text-[11px] text-slate-500 mt-0.5 inline-flex items-center gap-1">Daily limit
            {usage && <select defaultValue={usage.cap} onChange={e => saveCap(Number(e.target.value))} data-testid="whatsapp-daily-cap" className="border border-slate-200 rounded-md px-1.5 py-0.5 text-[11px] text-slate-800 bg-white">
              {[200, 500, 1000, 2000, 5000].map(v => <option key={v} value={v}>{v}</option>)}
            </select>}
          </label>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Approved templates</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">{st.templates?.length ?? 0}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Booking · Reminder · Review · Win-back · Birthday · Festival</div>
        </div>
      </div>
      <p className="text-xs text-slate-500">Buy more credits below (Razorpay, instant). SMS is used automatically when credits run out.</p>
      <div className="-mx-5 -mb-5" data-testid="whatsapp-buy-packs"><SmsPacksCard defaultChannel="whatsapp" embedded /></div>
    </div>
  );
};

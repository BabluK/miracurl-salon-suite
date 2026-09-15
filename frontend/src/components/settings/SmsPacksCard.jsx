import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Loader2, Zap } from "lucide-react";

function loadRazorpayScript() {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function SmsPacksCard() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState("");
  const [channel, setChannel] = useState("sms");
  const isWA = channel === "whatsapp";
  const unit = isWA ? "WhatsApp msg" : "SMS";

  const refresh = () => api.get(`/sms-packs?channel=${channel}`).then(r => setCfg(r.data)).catch(() => setCfg({ enabled: false, packs: [], balance: 0, balances: {} }));
  useEffect(() => { refresh(); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg) return null;

  async function buy(pack) {
    setBusy(pack.key);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Couldn't load Razorpay — check your internet"); return; }
      const { data: order } = await api.post("/sms-packs/order", { pack: pack.key, channel });
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: `Miracurl ✦ ${isWA ? "WhatsApp" : "SMS"} Credits`,
        description: order.pack_label,
        order_id: order.order_id,
        theme: { color: "#10b981" },
        handler: async (rzp) => {
          try {
            const { data } = await api.post("/sms-packs/verify", {
              razorpay_order_id: rzp.razorpay_order_id,
              razorpay_payment_id: rzp.razorpay_payment_id,
              razorpay_signature: rzp.razorpay_signature, channel,
            });
            toast.success(`✅ +${data.points_added} ${unit} credits added — balance ${data.balance}`);
            refresh();
          } catch (e) {
            toast.error(e.response?.data?.detail || "Verification failed. Contact support.");
          }
        },
        modal: { ondismiss: () => setBusy("") },
      };
      new window.Razorpay(options).open();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start checkout");
    } finally { setBusy(""); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="sms-packs-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Message credits</h2>
          <p className="text-xs text-slate-500 mt-1">
            Every guest message (booking confirmation, receipt, reminder) uses 1 credit. Buy a pack below — HQ is notified and can also credit you manually.
          </p>
        </div>
        <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold" data-testid="sms-balance-chip">
          {cfg.balance} {unit} left
        </span>
      </div>
      <div className="flex gap-1.5 mt-4" data-testid="message-channel-tabs">
        {[["sms", "SMS", cfg.balances?.sms], ["whatsapp", "WhatsApp", cfg.balances?.whatsapp]].map(([k, l, b]) => (
          <button key={k} data-testid={`channel-tab-${k}`} onClick={() => setChannel(k)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${channel === k ? "bg-slate-900 text-emerald-300 border-slate-900" : "border-slate-300 text-slate-600 hover:border-slate-500"}`}>
            {l} · {b ?? 0}
          </button>
        ))}
      </div>

      {cfg.enabled ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          {cfg.packs.map(p => (
            <button key={p.key} data-testid={`buy-${p.key}`} onClick={() => buy(p)} disabled={!!busy}
              className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-400 transition group disabled:opacity-60">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{p.label}</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">₹{p.price}</div>
              <div className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                <Zap className="w-3 h-3" /> {p.points} {isWA ? "WhatsApp" : "SMS"}
                {busy === p.key && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">≈ ₹{(p.price / p.points).toFixed(2)} / {unit}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Online purchase is unavailable right now — contact HQ and they'll credit points to your salon manually.
        </div>
      )}
    </div>
  );
}

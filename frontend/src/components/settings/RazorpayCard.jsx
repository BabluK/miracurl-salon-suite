import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { CreditCard, Check, Sparkles, Loader2 } from "lucide-react";

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

export function RazorpayCard() {
  const [cfg, setCfg] = useState(null);
  const [selected, setSelected] = useState("half_year");
  const [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    api.get("/billing/razorpay/config").then(r => {
      setCfg(r.data);
      if (r.data.plans?.length) setSelected(r.data.plans[0].key);
    }).catch(() => setCfg({ enabled: false }));
    api.get("/tenants/current").then(r => setTenant(r.data)).catch(() => {});
  }, []);

  if (!cfg) return null;
  if (!cfg.enabled) return null;

  const chosen = cfg.plans.find(p => p.key === selected) || cfg.plans[0];

  async function pay() {
    if (!chosen) return;
    setBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Couldn't load Razorpay — check your internet"); return; }
      const { data: order } = await api.post("/billing/razorpay/order", { plan: chosen.key });
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Miracurl ✦ Salon Suite",
        description: `${order.plan_label} renewal`,
        order_id: order.order_id,
        theme: { color: "#ec4899" },
        prefill: {
          name: tenant?.name || "",
          email: tenant?.owner_email || "",
          contact: (tenant?.whatsapp_number || tenant?.phone || "").replace(/\D/g, "").slice(-10),
        },
        notes: {
          tenant_slug: tenant?.slug || "",
          plan: chosen.key,
        },
        handler: async (rzp) => {
          try {
            await api.post("/billing/razorpay/verify", {
              plan: chosen.key,
              razorpay_order_id: rzp.razorpay_order_id,
              razorpay_payment_id: rzp.razorpay_payment_id,
              razorpay_signature: rzp.razorpay_signature,
            });
            toast.success("Payment successful — subscription active ✦");
          } catch (e) {
            toast.error(e.response?.data?.detail || "Verification failed. Contact support.");
          }
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      };
      new window.Razorpay(options).open();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start checkout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-razorpay-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            Subscription & renewal
            {cfg.test_mode && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium uppercase tracking-wider">Test mode</span>}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pay by card, UPI or NetBanking. Your affiliate credits are auto-applied at checkout.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        {cfg.plans.map(p => (
          <button
            key={p.key}
            type="button"
            data-testid={`plan-${p.key}`}
            onClick={() => setSelected(p.key)}
            className={`text-left p-4 rounded-xl border-2 transition ${
              selected === p.key
                ? "border-indigo-500 bg-indigo-50/50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">{p.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.duration_days} days of access</div>
              </div>
              {selected === p.key && <Check className="w-5 h-5 text-indigo-600" />}
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">₹{Number(p.price).toLocaleString("en-IN")}</div>
            {p.key === "annual" && (
              <div className="mt-1 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Best value · one payment, whole year sorted
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-5 gap-3">
        <div className="text-xs text-slate-500">
          Payments secured by <b>Razorpay</b>. Cards / UPI / NetBanking accepted.
          {cfg.test_mode && (
            <span className="block mt-1 text-amber-700">
              🧪 Test mode: use card <span className="font-mono">4111 1111 1111 1111</span>, any CVV, any future expiry.
            </span>
          )}
        </div>
        <button
          data-testid="razorpay-pay-btn"
          onClick={pay}
          disabled={busy || !chosen}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 text-white font-semibold text-sm hover:from-indigo-600 hover:to-blue-700 shadow-sm disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {busy ? "Opening…" : chosen ? `Pay ₹${Number(chosen.price).toLocaleString("en-IN")}` : "Choose a plan"}
        </button>
      </div>
    </div>
  );
}

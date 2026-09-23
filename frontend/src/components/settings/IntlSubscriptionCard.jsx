import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { CreditCard, Check, Loader2, Sparkles, Globe } from "lucide-react";
import { trackPurchase } from "@/lib/analytics";

const fmtUSD = (n) => "$" + Number(n).toLocaleString("en-US");
const TIERS = [["starter", "Starter"], ["pro", "Professional"], ["premium", "Premium AI"]];
const DURATIONS = [["monthly", "Monthly"], ["annual", "1 Year · 2 months free"]];

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

// International (USD) plans — paid through Razorpay International (cards worldwide, Apple/Google Pay).
export function IntlSubscriptionCard() {
  const { tenant, refresh } = useAuth();
  const [plans, setPlans] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [tier, setTier] = useState("pro");
  const [dur, setDur] = useState("annual");
  const [busy, setBusy] = useState(false);

  const isIntl = !!tenant && (tenant.currency || "INR") !== "INR";

  useEffect(() => {
    if (!isIntl) return;
    api.get("/public/plans").then(r => {
      setPlans(Object.entries(r.data).filter(([k]) => k.startsWith("intl_")).map(([key, v]) => ({ key, ...v })));
    }).catch(() => setPlans([]));
    api.get("/billing/razorpay/config").then(r => setCfg(r.data)).catch(() => setCfg({ enabled: false }));
  }, [isIntl]);

  if (!isIntl) return null;

  const key = `intl_${tier}_${dur}`;
  const chosen = plans?.find(p => p.key === key);
  const split = !!chosen && chosen.price > 500;
  const monthly = plans?.find(p => p.key === `intl_${tier}_monthly`);
  const saving = chosen && monthly && dur !== "monthly" ? monthly.price * 12 - chosen.price : 0;

  async function pay() {
    if (!chosen) return;
    setBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Couldn't load the payment window — check your internet"); return; }
      const { data: order } = await api.post("/billing/razorpay/order", { plan: key });
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: tenant?.business_type === "restaurant" ? "Miracurl ✦ Restaurant Suite" : "Miracurl ✦ Salon Suite",
        description: order.installments === 2 ? `${order.plan_label} · Instalment 1 of 2` : order.plan_label,
        order_id: order.order_id,
        theme: { color: "#c99a2e" },
        prefill: { name: tenant?.name || "", email: tenant?.owner_email || "" },
        notes: { tenant_slug: tenant?.slug || "", plan: key },
        handler: async (rzp) => {
          try {
            await api.post("/billing/razorpay/verify", {
              plan: key,
              razorpay_order_id: rzp.razorpay_order_id,
              razorpay_payment_id: rzp.razorpay_payment_id,
              razorpay_signature: rzp.razorpay_signature,
            });
            toast.success("Payment received — your subscription is active 🎉");
            trackPurchase({ transaction_id: rzp.razorpay_payment_id, value: (order.amount || 0) / 100, currency: order.currency || "USD", plan: key, gateway: "razorpay", source: "settings" });
            refresh?.();
          } catch (e) {
            toast.error(e.response?.data?.detail || "Verification failed. Contact support.");
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      };
      new window.Razorpay(options).open();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start checkout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="subscription-intl" className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm scroll-mt-24" data-testid="settings-intl-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-[#b8892a] flex items-center justify-center">
          <Globe className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            Subscription & renewal (USD)
            {cfg?.test_mode && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium uppercase tracking-wider">Test mode</span>}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pay securely in US dollars with any international card, Apple Pay or Google Pay — powered by <b>Razorpay International</b>. Your plan activates instantly.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TIERS.map(([k, l]) => (
          <button key={k} type="button" data-testid={`intl-tier-${k}`} onClick={() => setTier(k)}
            className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${tier === k
              ? "bg-[#1a1408] text-[#e8c56a] border-[#1a1408]"
              : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        {DURATIONS.map(([k, l]) => {
          const p = plans?.find(x => x.key === `intl_${tier}_${k}`);
          return (
            <button key={k} type="button" data-testid={`intl-duration-${k}`} onClick={() => setDur(k)}
              className={`text-left p-3.5 rounded-xl border-2 transition ${dur === k
                ? "border-[#c99a2e] bg-amber-50/60"
                : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">{l}</span>
                {dur === k && <Check className="w-4 h-4 text-[#b8892a]" />}
              </div>
              <div className="mt-1.5 text-xl font-bold text-slate-900">{p ? fmtUSD(p.price) : "—"}</div>
              {k === "annual" && (
                <div className="mt-0.5 text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Best value
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-5 gap-3">
        <div className="text-xs text-slate-500">
          {saving > 0 && <span className="text-emerald-600 font-semibold">You save {fmtUSD(saving)} vs monthly · </span>}
          Cards accepted worldwide · no GST on international invoices · billed once, no auto-renewal surprises.
        </div>
        <button data-testid="intl-pay-btn" onClick={pay} disabled={busy || !chosen || cfg?.enabled === false}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] font-semibold text-sm hover:brightness-110 shadow-sm disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {busy ? "Opening…" : chosen ? (split ? `Pay ${fmtUSD(chosen.price / 2)} now & Activate` : `Pay ${fmtUSD(chosen.price)} & Activate`) : "Choose a plan"}
        </button>
        {split && (
          <p className="text-[11px] text-slate-500 mt-2 leading-snug" data-testid="intl-installment-note">
            Billed in <b>2 instalments of {fmtUSD(chosen.price / 2)}</b> (6 months each) — international card limit. Pay the 2nd instalment before the first half ends to keep the annual price.
          </p>
        )}
      </div>
    </div>
  );
}

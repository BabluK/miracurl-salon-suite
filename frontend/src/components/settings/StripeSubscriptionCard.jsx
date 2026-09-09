import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { CreditCard, Check, Loader2, Sparkles, Globe } from "lucide-react";
import { trackPurchase } from "@/lib/analytics";

const fmtUSD = (n) => "$" + Number(n).toLocaleString("en-US");
const TIERS = [["starter", "Starter"], ["pro", "Professional"], ["premium", "Premium AI"]];
const DURATIONS = [["monthly", "Monthly"], ["half", "6 Months"], ["annual", "1 Year"]];

export function StripeSubscriptionCard() {
  const { tenant, refresh } = useAuth();
  const [plans, setPlans] = useState(null);
  const [tier, setTier] = useState("pro");
  const [dur, setDur] = useState("annual");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const isIntl = !!tenant && (tenant.currency || "INR") !== "INR";

  useEffect(() => {
    if (!isIntl) return;
    api.get("/public/plans").then(r => {
      setPlans(Object.entries(r.data).filter(([k]) => k.startsWith("intl_")).map(([key, v]) => ({ key, ...v })));
    }).catch(() => setPlans([]));
  }, [isIntl]);

  useEffect(() => {
    if (!isIntl) return;
    const sid = new URLSearchParams(window.location.search).get("stripe_session");
    if (!sid) return;
    window.history.replaceState({}, "", window.location.pathname);
    setVerifying(true);
    let attempts = 0;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      attempts += 1;
      try {
        const { data } = await api.get(`/billing/stripe/status/${sid}`);
        if (data.payment_status === "paid") {
          setVerifying(false);
          toast.success("Payment received — your subscription is active 🎉");
          trackPurchase({ transaction_id: sid, value: data.amount, currency: data.currency || "USD", plan: data.plan, gateway: "stripe", source: "settings" });
          refresh?.();
          return;
        }
      } catch { /* keep polling */ }
      if (attempts >= 8) {
        setVerifying(false);
        toast.info("Payment is still processing — it will activate automatically once confirmed.");
        return;
      }
      setTimeout(poll, 2500);
    };
    poll();
    return () => { stopped = true; };
  }, [isIntl, refresh]);

  if (!isIntl) return null;

  const key = `intl_${tier}_${dur}`;
  const chosen = plans?.find(p => p.key === key);
  const monthly = plans?.find(p => p.key === `intl_${tier}_monthly`);
  const saving = chosen && monthly && dur !== "monthly"
    ? monthly.price * (dur === "half" ? 6 : 12) - chosen.price : 0;

  async function pay() {
    if (!chosen) return;
    setBusy(true);
    try {
      const { data } = await api.post("/billing/stripe/checkout", { plan: key, origin_url: window.location.origin });
      window.location.assign(data.checkout_url);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start Stripe checkout");
      setBusy(false);
    }
  }

  return (
    <div id="subscription-intl" className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm scroll-mt-24" data-testid="settings-stripe-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
          <Globe className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Subscription & renewal (USD)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Pay securely in dollars with any international card — powered by <b>Stripe</b>. Your plan activates instantly.
          </p>
        </div>
        {verifying && (
          <span className="inline-flex items-center gap-1.5 text-xs text-violet-600 font-medium" data-testid="stripe-verifying">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirming payment…
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TIERS.map(([k, l]) => (
          <button key={k} type="button" data-testid={`stripe-tier-${k}`} onClick={() => setTier(k)}
            className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${tier === k
              ? "bg-violet-600 text-white border-violet-600"
              : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        {DURATIONS.map(([k, l]) => {
          const p = plans?.find(x => x.key === `intl_${tier}_${k}`);
          return (
            <button key={k} type="button" data-testid={`stripe-duration-${k}`} onClick={() => setDur(k)}
              className={`text-left p-3.5 rounded-xl border-2 transition ${dur === k
                ? "border-violet-500 bg-violet-50/50"
                : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">{l}</span>
                {dur === k && <Check className="w-4 h-4 text-violet-600" />}
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
          Cards accepted worldwide. Billed once — no auto-renewal surprises.
        </div>
        <button data-testid="stripe-pay-btn" onClick={pay} disabled={busy || !chosen}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-semibold text-sm hover:from-violet-700 hover:to-fuchsia-700 shadow-sm disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {busy ? "Redirecting…" : chosen ? `Pay ${fmtUSD(chosen.price)} & Activate` : "Choose a plan"}
        </button>
      </div>
    </div>
  );
}

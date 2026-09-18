import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { CreditCard, Check, Sparkles, Loader2, Store } from "lucide-react";
import { trackPurchase } from "@/lib/analytics";

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
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [selected, setSelected] = useState("half_year");
  const [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState(null);
  const [branchIds, setBranchIds] = useState([]);

  const salons = user?.salons || [];
  const ownedCount = Math.max(salons.length, 1);

  const [tax, setTax] = useState(null);
  const gstPct = tax?.apply_gst === false ? 0 : Number(tax?.gst_rate_pct ?? 18);
  const withGst = (p) => Math.round(Number(p) * (1 + gstPct / 100));
  useEffect(() => {
    api.get("/billing/razorpay/config").then(r => {
      setCfg(r.data);
      if (r.data.plans?.length) setSelected(r.data.plans[0].key);
    }).catch(() => setCfg({ enabled: false }));
    api.get("/tenants/current").then(r => setTenant(r.data)).catch(() => {});
    api.get("/billing/tax-profile").then(r => setTax(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tenant?.business_type === "restaurant") setSelected("resto_quarter");
  }, [tenant]);

  if (!cfg) return null;
  if (!cfg.enabled) return null;
  if (tenant && (tenant.currency || "INR") !== "INR") return null; // intl salons pay in USD via Stripe

  const isResto = tenant?.business_type === "restaurant";
  const visiblePlans = (cfg.plans || []).filter(p => !p.key.includes("intl"))
    .filter(p => (isResto ? p.key.startsWith("resto_") : !p.key.startsWith("resto_")))
    .filter(p => (p.branches || 1) === 1 || ownedCount >= (p.branches || 1));
  const chosen = visiblePlans.find(p => p.key === selected) || visiblePlans[0];
  const needBranches = (chosen?.branches || 1) > 1;
  const requiredBranches = chosen?.branches || 1;

  function pickPlan(key) {
    setSelected(key);
    const p = visiblePlans.find(x => x.key === key);
    if ((p?.branches || 1) > 1) {
      // Pre-select the current salon + next branches up to the plan size
      const ids = [user?.tenant_id, ...salons.map(s => s.id).filter(id => id !== user?.tenant_id)]
        .filter(Boolean).slice(0, p.branches);
      setBranchIds(ids);
    } else {
      setBranchIds([]);
    }
  }

  function toggleBranch(id) {
    if (id === user?.tenant_id) return; // paying salon must stay selected
    setBranchIds(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : (prev.length < requiredBranches || requiredBranches >= 5 ? [...prev, id] : prev));
  }

  const branchCountOk = !needBranches ||
    (requiredBranches >= 5 ? branchIds.length >= requiredBranches : branchIds.length === requiredBranches);

  async function pay() {
    if (!chosen) return;
    if (needBranches && !branchCountOk) {
      toast.error(`Select ${requiredBranches >= 5 ? "at least" : "exactly"} ${requiredBranches} branches for this plan`);
      return;
    }
    setBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Couldn't load Razorpay — check your internet"); return; }
      const { data: order } = await api.post("/billing/razorpay/order", {
        plan: chosen.key,
        ...(needBranches ? { branch_tenant_ids: branchIds } : {}),
      });
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: isResto ? "Miracurl ✦ Restaurant Suite" : "Miracurl ✦ Salon Suite",
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
            trackPurchase({ transaction_id: rzp.razorpay_payment_id, value: (order.amount || 0) / 100, currency: order.currency || "INR", plan: chosen.key, gateway: "razorpay", source: "settings" });
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
    <div id="subscription" className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm scroll-mt-24" data-testid="settings-razorpay-card">
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
        {visiblePlans.map(p => (
          <button
            key={p.key}
            type="button"
            data-testid={`plan-${p.key}`}
            onClick={() => pickPlan(p.key)}
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
            {(p.branches || 1) > 1 && (
              <div className="mt-1 text-[11px] text-fuchsia-600 font-medium flex items-center gap-1">
                <Store className="w-3 h-3" /> Covers {p.branches}{p.branches >= 5 ? "+" : ""} branches · bulk saving
              </div>
            )}
            {p.key === "annual" && (
              <div className="mt-1 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Best value · one payment, whole year sorted
              </div>
            )}
          </button>
        ))}
      </div>

      {needBranches && salons.length > 1 && (
        <div className="mt-4 p-4 rounded-xl bg-fuchsia-50/60 border border-fuchsia-200" data-testid="branch-selector">
          <p className="text-xs font-semibold text-fuchsia-800 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" />
            Pick {requiredBranches >= 5 ? `at least ${requiredBranches}` : requiredBranches} branches this plan covers
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${branchCountOk ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
              {branchIds.length}/{requiredBranches} selected
            </span>
          </p>
          <div className="mt-2.5 space-y-1.5">
            {salons.map(s => {
              const checked = branchIds.includes(s.id);
              const isPayer = s.id === user?.tenant_id;
              return (
                <label key={s.id} data-testid={`branch-pick-${s.slug}`}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-sm ${checked ? "bg-white border-fuchsia-300" : "bg-white/50 border-slate-200"} ${isPayer ? "opacity-90" : ""}`}>
                  <input type="checkbox" checked={checked} disabled={isPayer} onChange={() => toggleBranch(s.id)}
                    className="w-4 h-4 accent-fuchsia-600" />
                  <span className="font-medium text-slate-800 truncate">{s.name}</span>
                  <span className="text-[10px] text-slate-400 truncate">{s.location || s.slug}</span>
                  {isPayer && <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider shrink-0">This salon</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}

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
          {busy ? "Opening…" : chosen ? `Pay ₹${withGst(chosen.price).toLocaleString("en-IN")}` : "Choose a plan"}
        </button>
      </div>
      {chosen && gstPct > 0 && (
        <div className="mt-2 text-xs text-slate-500 text-right" data-testid="plan-gst-note">
          ₹{Number(chosen.price).toLocaleString("en-IN")} + {gstPct}% GST ₹{(withGst(chosen.price) - Number(chosen.price)).toLocaleString("en-IN")}
          {tax?.gstin ? ` · GSTIN ${tax.gstin}` : " · tax invoice issued by " + (tax?.legal_name || "Miracurl Studio")}
          {tax?.msme ? ` · MSME ${tax.msme}` : ""}
        </div>
      )}
    </div>
  );
}

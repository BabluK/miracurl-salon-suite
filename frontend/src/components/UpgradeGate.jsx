import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Sparkles } from "lucide-react";

const TIER_LABEL = { starter: "Starter", professional: "Professional", premium: "Premium AI", enterprise: "Enterprise" };
const PRO = ["inventory", "attendance", "reports", "staff-activities", "hire"];
const requiredTier = (module) => (PRO.includes(module) ? "Professional" : "Premium AI");

export function UpgradeGate({ label, tier, module }) {
  const nav = useNavigate();
  const needed = requiredTier(module);
  return (
    <div className="min-h-[60vh] flex items-center justify-center" data-testid="upgrade-gate">
      <div className="max-w-md w-full rounded-3xl border border-[#E8E2D9] bg-white p-8 text-center shadow-[0_8px_30px_rgba(15,30,51,.06)]">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#F9F3EA] text-[#B8893A] flex items-center justify-center"><Lock className="w-6 h-6" /></div>
        <h1 className="font-playfair text-2xl text-slate-900 mt-4">{label} is not in your {TIER_LABEL[tier] || "current"} plan</h1>
        <p className="text-sm text-slate-500 mt-2">Upgrade to <b>{needed}</b> to unlock {label} — switch plans any time, prorated.</p>
        <button data-testid="upgrade-gate-cta" onClick={() => nav("/settings#subscription")}
          className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(201,162,74,.25)] hover:brightness-105 active:scale-95 transition-[transform,filter]"
          style={{ background: "linear-gradient(135deg, #D4AF37 0%, #C9A24A 50%, #B8893A 100%)" }}>
          <Sparkles className="w-4 h-4" /> See plans & upgrade <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

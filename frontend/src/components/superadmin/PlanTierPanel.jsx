import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Check, Minus, Crown, Globe } from "lucide-react";

const TIER_LABEL = { starter: "Starter", professional: "Professional", premium: "Premium AI", enterprise: "Enterprise" };

export function PlanTierPanel({ ent, busy, onPick, onLocks }) {
  const [matrix, setMatrix] = useState(null);
  const [showCompare, setShowCompare] = useState(false);
  useEffect(() => { api.get("/super-admin/entitlements/matrix").then(r => setMatrix(r.data)).catch(() => {}); }, []);
  if (!ent) return null;
  const usd = ent.currency === "USD";
  const cur = ent.tier || "premium";
  const modules = matrix ? Object.keys(matrix.modules) : [];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="hq-plan-tier-panel">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-500" /> Plan features & module access
            {ent.grandfathered && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold" data-testid="hq-grandfathered-badge">onboarded before gating · all features</span>}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {usd ? <>USD salon · plan <b>{ent.plan || "trial"}</b> → tier <b>{TIER_LABEL[cur]}</b>{ent.forced ? " (set by HQ)" : " (from plan; trial = Premium AI)"}. Modules outside the tier are hidden behind an upgrade screen.</>
              : <>INR salon — all modules included, no tier gating. Tiers apply to USD salons only.</>}
          </p>
        </div>
        <button onClick={() => setShowCompare(v => !v)} data-testid="hq-compare-toggle" className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-slate-300 inline-flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> {showCompare ? "Hide" : "Compare"} US competitors</button>
      </div>
      {usd && (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="hq-tier-chips">
          {["auto", "starter", "professional", "premium", "enterprise"].map(t => {
            const on = t === "auto" ? !ent.forced : ent.forced && ent.tier === t;
            return (
              <button key={t} data-testid={`hq-tier-${t}`} disabled={!!busy} onClick={() => onPick(t)}
                className={`text-[11px] px-3 py-1.5 rounded-full border font-semibold transition-colors ${on ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"} disabled:opacity-50`}>
                {t === "auto" ? "Auto (from plan)" : `${TIER_LABEL[t]}${matrix?.prices?.[t] ? ` · $${matrix.prices[t]}` : ""}`}
              </button>
            );
          })}
        </div>
      )}
      {matrix && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3" data-testid="hq-module-access">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] font-semibold text-slate-700">What this salon can use <span className="font-normal text-slate-500">— untick to restrict (enforced in the app and the API)</span></div>
            <div className="flex gap-2">
              <button disabled={!!busy} onClick={() => onLocks([])} data-testid="hq-modules-allow-all" className="text-[10px] px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-slate-300">Allow all</button>
              {usd && ent.tier && <button disabled={!!busy} onClick={() => onLocks(modules.filter(m => !matrix.tier_modules[ent.tier]?.includes(m)))} data-testid="hq-modules-match-plan" className="text-[10px] px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-slate-300">Match {TIER_LABEL[ent.tier]} plan</button>}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
            {modules.map(m => {
              const byTier = (ent.tier_locked || []).includes(m);
              const manual = (ent.module_locks || []).includes(m);
              const on = !byTier && !manual;
              return (
                <label key={m} className={`flex items-center gap-2 text-[11px] ${byTier ? "text-slate-400" : "text-slate-700"}`} title={byTier ? "Not in this salon's plan tier" : ""}>
                  <input type="checkbox" data-testid={`hq-module-${m}`} checked={on} disabled={!!busy || byTier}
                    onChange={(e) => onLocks(e.target.checked ? (ent.module_locks || []).filter(x => x !== m) : [...(ent.module_locks || []), m])}
                    className="accent-slate-900" />
                  <span className={on ? "" : "line-through decoration-slate-300"}>{matrix.modules[m]}</span>
                  {byTier && <span className="text-[9px] px-1 rounded bg-amber-50 text-amber-700 border border-amber-200">plan</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {matrix && (
        <div className="mt-4 overflow-x-auto" data-testid="hq-tier-matrix">
          <table className="w-full text-[11px]">
            <thead><tr className="text-left text-slate-500">
              <th className="py-1.5 pr-3 font-medium">Module</th>
              {matrix.tiers.map(t => <th key={t} className={`py-1.5 px-2 font-semibold text-center ${usd && t === cur ? "text-slate-900" : ""}`}>{TIER_LABEL[t]}<div className="text-[10px] text-slate-400 font-normal">${matrix.prices[t]}/mo</div></th>)}
            </tr></thead>
            <tbody>
              {modules.map(m => (
                <tr key={m} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-700">{matrix.modules[m]}</td>
                  {matrix.tiers.map(t => <td key={t} className={`py-1.5 px-2 text-center ${usd && t === cur ? "bg-amber-50/60" : ""}`}>
                    {matrix.tier_modules[t].includes(m) ? <Check className="w-3.5 h-3.5 text-emerald-600 inline" /> : <Minus className="w-3.5 h-3.5 text-slate-300 inline" />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCompare && matrix && (
        <div className="mt-4 grid sm:grid-cols-2 gap-2" data-testid="hq-competitor-compare">
          {matrix.competitors.map(c => (
            <div key={c.name} className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-800">{c.name}</div>
              <div className="text-[11px] text-slate-500">{c.price} · trial {c.trial} · commission: {c.commission}</div>
              <ul className="mt-1.5 space-y-0.5">{c.gaps.map(g => <li key={g} className="text-[11px] text-rose-600">✕ {g}</li>)}</ul>
            </div>
          ))}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:col-span-2 text-[11px] text-emerald-800">
            <b>Miracurl edge at every tier:</b> Starter $39 already includes memberships & gift cards, Google review automation, WhatsApp reminders and a customer chat inbox — features competitors sell as add-ons or reserve for $49–$168 plans. Premium AI $149 adds the Mira AI receptionist & marketing studio, which none of the US competitors offer at any price. No per-staff fees, no marketplace commission, 30-day trial.
          </div>
        </div>
      )}
    </div>
  );
}

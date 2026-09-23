import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import api from "@/lib/api";

/** Onboarding: tick what the new salon may use. Unticked modules are locked in the app and at the API from first login. */
export function ModuleAccessPicker({ value = [], onChange, usd = false, tier = null }) {
  const [matrix, setMatrix] = useState(null);
  useEffect(() => { api.get("/super-admin/entitlements/matrix").then(r => setMatrix(r.data)).catch(() => {}); }, []);
  if (!matrix) return null;
  const modules = Object.keys(matrix.modules);
  const locks = new Set(value);
  const toggle = (m) => { const n = new Set(locks); n.has(m) ? n.delete(m) : n.add(m); onChange([...n]); };
  const matchTier = (t) => onChange(modules.filter(m => !matrix.tier_modules[t]?.includes(m)));
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[.03] p-3.5" data-testid="onboard-module-picker">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"><LockKeyhole className="w-3.5 h-3.5 text-[#d4af37]" /> Features this {usd ? "salon" : "business"} can use
          <span className="text-[10px] font-normal text-slate-500">· untick to restrict ({locks.size} locked)</span></div>
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" onClick={() => onChange([])} data-testid="onboard-modules-all" className="text-[10px] px-2 py-1 rounded-md border border-white/15 text-slate-300 hover:bg-white/5">All features</button>
          {matrix.tiers.map(t => (
            <button key={t} type="button" onClick={() => matchTier(t)} data-testid={`onboard-modules-tier-${t}`}
              className={`text-[10px] px-2 py-1 rounded-md border hover:bg-white/5 ${tier === t ? "border-[#d4af37] text-[#F0D9A5]" : "border-white/15 text-slate-300"}`}>
              {t === "premium" ? "Premium AI" : t[0].toUpperCase() + t.slice(1)}{matrix.prices?.[t] && usd ? ` $${matrix.prices[t]}` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
        {modules.map(m => (
          <label key={m} className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
            <input type="checkbox" data-testid={`onboard-module-${m}`} checked={!locks.has(m)} onChange={() => toggle(m)} className="accent-[#d4af37]" />
            <span className={locks.has(m) ? "line-through text-slate-500" : ""}>{matrix.modules[m]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

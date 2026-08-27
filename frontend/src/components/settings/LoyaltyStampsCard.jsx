import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Stamp } from "lucide-react";

export function LoyaltyStampsCard() {
  const [cfg, setCfg] = useState(null);
  const [isResto, setIsResto] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/loyalty-stamps").then(r => setCfg(r.data)).catch(() => {});
    api.get("/tenants/current").then(r => setIsResto(r.data?.business_type === "restaurant")).catch(() => {});
  }, []);

  if (!cfg) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/loyalty-stamps", cfg);
      toast.success("Loyalty stamp card saved ✦");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="loyalty-stamps-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Stamp className="w-4 h-4 text-amber-600" /> Signature Loyalty Card
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.enabled} data-testid="loyalty-stamps-toggle"
            onChange={e => setCfg({ ...cfg, enabled: e.target.checked })}
            className="w-4 h-4 accent-amber-500" />
          <span className="text-sm text-slate-600">{cfg.enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>
      <p className="text-xs text-slate-400 mt-1">Guests earn a gold stamp every billed visit (staff can add extras in POS). A full card unlocks their treat — visible on your booking page too.</p>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <div>
          <label className="text-xs text-slate-500 font-medium">Stamps to fill the card</label>
          <input type="number" min={2} max={12} value={cfg.stamps_needed} data-testid="loyalty-stamps-needed-input"
            onChange={e => setCfg({ ...cfg, stamps_needed: Math.max(2, Math.min(12, Number(e.target.value) || 5)) })}
            className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Reward (shown to guests)</label>
          <input value={cfg.reward_label} maxLength={80} data-testid="loyalty-stamps-reward-input"
            onChange={e => setCfg({ ...cfg, reward_label: e.target.value })}
            placeholder={isResto ? "e.g. Free Dessert or 20% off the table" : "e.g. Free Hair Spa or 20% off next visit"}
            className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Discount % (guide for billing)</label>
          <input type="number" min={0} max={100} value={cfg.reward_discount_pct} data-testid="loyalty-stamps-pct-input"
            onChange={e => setCfg({ ...cfg, reward_discount_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {Array.from({ length: cfg.stamps_needed }).map((_, i) => (
          <span key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 ${i < cfg.stamps_needed - 1 ? "border-amber-300 text-amber-400" : "bg-gradient-to-br from-amber-400 to-yellow-600 border-amber-300 text-white"}`}>
            {i < cfg.stamps_needed - 1 ? "✦" : "🎁"}
          </span>
        ))}
        <span className="text-[11px] text-slate-400 ml-1">how guests see it</span>
      </div>
      <button onClick={save} disabled={saving} data-testid="loyalty-stamps-save-btn"
        className="mt-4 px-5 py-2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-sm font-semibold shadow hover:brightness-105 disabled:opacity-50">
        {saving ? "Saving…" : "Save loyalty card"}
      </button>
    </div>
  );
}

import { useState } from "react";
import { Plus, Trash2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { confirmAsync } from "@/components/ConfirmDialog";

const EMPTY = { label: "", price: "", months: "6", branches: "1", currency: "INR", vertical: "salon", tier: "", features: "", highlight: false };
const sym = (c) => (c === "USD" ? "$" : "₹");

export function AddPlanForm({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    const price = parseFloat(f.price);
    const months = parseFloat(f.months);
    if (f.label.trim().length < 2) return toast.error("Enter a plan name");
    if (!price || price <= 0) return toast.error("Enter a valid price");
    if (!months || months <= 0) return toast.error("Enter the duration in months");
    setBusy(true);
    try {
      const body = {
        label: f.label.trim(), price, duration_days: Math.round(months * 30.4), branches: parseInt(f.branches, 10) || 1,
        currency: f.currency, vertical: f.vertical, tier: f.currency === "USD" && f.tier ? f.tier : null,
        features: f.features.split(/\n|,/).map((x) => x.trim()).filter(Boolean), highlight: f.highlight,
      };
      const r = await api.post("/super-admin/plans", body);
      toast.success(`"${r.data.label}" added — live on the pricing page, signup and checkout ✦`);
      setF(EMPTY); setOpen(false); await onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't add plan"); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} data-testid="plan-add-open-btn"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800">
        <Plus className="w-4 h-4" /> Add a plan
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4" data-testid="plan-add-form">
      <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Sparkles className="w-4 h-4 text-sky-600" /> New plan</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        <label className="text-[11px] font-semibold text-slate-600 lg:col-span-2">Plan name
          <input data-testid="plan-add-label" className="input-light w-full mt-1 text-sm" value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Quarterly Plan (1 branch)" />
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Price ({sym(f.currency)})
          <input data-testid="plan-add-price" type="number" min="0" className="input-light w-full mt-1 text-sm" value={f.price} onChange={(e) => set("price", e.target.value)} />
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Duration (months)
          <input data-testid="plan-add-months" type="number" min="1" step="1" className="input-light w-full mt-1 text-sm" value={f.months} onChange={(e) => set("months", e.target.value)} />
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Branches included
          <input data-testid="plan-add-branches" type="number" min="1" className="input-light w-full mt-1 text-sm" value={f.branches} onChange={(e) => set("branches", e.target.value)} />
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Business
          <select data-testid="plan-add-vertical" className="input-light w-full mt-1 text-sm" value={f.vertical} onChange={(e) => set("vertical", e.target.value)}>
            <option value="salon">Salon & Spa</option><option value="restaurant">Restaurant</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Market / currency
          <select data-testid="plan-add-currency" className="input-light w-full mt-1 text-sm" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
            <option value="INR">India · ₹ INR</option><option value="USD">US & international · $ USD</option>
          </select>
        </label>
        {f.currency === "USD" && (
          <label className="text-[11px] font-semibold text-slate-600">Feature tier (US gating)
            <select data-testid="plan-add-tier" className="input-light w-full mt-1 text-sm" value={f.tier} onChange={(e) => set("tier", e.target.value)}>
              <option value="">— none —</option><option value="starter">Starter</option><option value="professional">Professional</option>
              <option value="premium">Premium AI</option><option value="enterprise">Enterprise</option>
            </select>
          </label>
        )}
        <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2 lg:col-span-4">What's included (one per line or comma-separated)
          <textarea data-testid="plan-add-features" rows={2} className="input-light w-full mt-1 text-sm" value={f.features} onChange={(e) => set("features", e.target.value)} placeholder="Unlimited bookings, POS billing, WhatsApp reminders" />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" data-testid="plan-add-highlight" checked={f.highlight} onChange={(e) => set("highlight", e.target.checked)} /> Mark as “Best value”
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => { setOpen(false); setF(EMPTY); }} className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-white" data-testid="plan-add-cancel">Cancel</button>
        <button onClick={submit} disabled={busy} data-testid="plan-add-submit" className="px-4 py-1.5 rounded-md bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 disabled:opacity-50">{busy ? "Adding…" : "Add plan"}</button>
      </div>
    </div>
  );
}

export function PlanRowActions({ p, onSaved }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    const msg = p.custom
      ? `Delete "${p.label}" permanently?\n\nIt disappears from the pricing page, signup and checkout immediately. Salons already on it keep their access.`
      : `Hide "${p.label}" from the pricing page, signup and checkout?\n\nYou can restore it any time. Salons already on it keep their access.`;
    if (!await confirmAsync(msg)) return;
    setBusy(true);
    try {
      await api.delete(`/super-admin/plans/${p.key}`);
      toast.success(p.custom ? "Plan deleted" : "Plan hidden everywhere");
      await onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't remove plan"); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    setBusy(true);
    try { await api.post(`/super-admin/plans/${p.key}/restore`); toast.success("Plan is live again"); await onSaved(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't restore"); }
    finally { setBusy(false); }
  };
  if (p.hidden) {
    return (
      <button onClick={restore} disabled={busy} data-testid={`plan-restore-${p.key}`} title="Show this plan again"
        className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-semibold inline-flex items-center gap-1 disabled:opacity-40">
        <RotateCcw className="w-3.5 h-3.5" /> Restore
      </button>
    );
  }
  return (
    <button onClick={remove} disabled={busy} data-testid={`plan-delete-${p.key}`} title={p.custom ? "Delete plan" : "Hide plan everywhere"}
      className="w-8 h-8 rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 inline-flex items-center justify-center disabled:opacity-40">
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

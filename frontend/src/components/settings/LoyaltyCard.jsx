import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Coins, Save } from "lucide-react";

const inputCls = "mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200";

export function LoyaltyCard() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/loyalty").then(r => setForm(r.data)).catch(() => {});
  }, []);
  if (!form) return null;

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put("/settings/loyalty", {
        earn_per_100: Number(form.earn_per_100) || 0,
        max_redeem_per_visit: Number(form.max_redeem_per_visit) || 0,
        min_bill_to_redeem: Number(form.min_bill_to_redeem) || 0,
      });
      setForm(data);
      toast.success("Loyalty rules saved — POS applies them immediately ✦");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save loyalty rules");
    } finally { setSaving(false); }
  }

  const example = Math.floor(10000 / 100) * (Number(form.earn_per_100) || 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-loyalty-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
          <Coins className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Loyalty points</h2>
          <p className="text-xs text-slate-500 mt-1">
            Guests earn points on every bill (1 point = ₹1) and redeem them on future visits — under your rules.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
        <div>
          <label className="text-xs text-slate-500 font-medium">Points earned per ₹100 billed</label>
          <input data-testid="loyalty-earn-input" type="number" min="0" max="100" step="0.5" className={inputCls}
            value={form.earn_per_100} onChange={e => setForm({ ...form, earn_per_100: e.target.value })} />
          <p className="text-[11px] text-slate-400 mt-1">e.g. 10 → a ₹10,000 month gives 1,000 points</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Max points redeemable per visit</label>
          <input data-testid="loyalty-max-redeem-input" type="number" min="0" step="50" className={inputCls}
            value={form.max_redeem_per_visit} onChange={e => setForm({ ...form, max_redeem_per_visit: e.target.value })} />
          <p className="text-[11px] text-slate-400 mt-1">e.g. 200 → max ₹200 off per bill</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Minimum bill to redeem (₹)</label>
          <input data-testid="loyalty-min-bill-input" type="number" min="0" step="100" className={inputCls}
            value={form.min_bill_to_redeem} onChange={e => setForm({ ...form, min_bill_to_redeem: e.target.value })} />
          <p className="text-[11px] text-slate-400 mt-1">e.g. 1000 → redeemable only on ₹1,000+ services</p>
        </div>
      </div>

      <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800" data-testid="loyalty-example">
        With these rules: a guest billing <b>₹10,000</b> in a month earns <b>{example.toLocaleString("en-IN")} points (₹{example.toLocaleString("en-IN")})</b>; on their next visit they can redeem up to <b>₹{Number(form.max_redeem_per_visit || 0).toLocaleString("en-IN")}</b> — but only on bills of <b>₹{Number(form.min_bill_to_redeem || 0).toLocaleString("en-IN")}+</b>.
      </div>

      <div className="flex justify-end mt-5">
        <button data-testid="loyalty-save-btn" onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm hover:from-amber-600 hover:to-orange-600 shadow-sm disabled:opacity-60">
          <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save loyalty rules"}
        </button>
      </div>
    </div>
  );
}

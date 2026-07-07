import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { AlarmClock, Save, Info } from "lucide-react";

const inputCls = "mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";

const TIERS = [
  { key: "fine_5", label: "Up to 5 min late" },
  { key: "fine_10", label: "6 – 10 min late" },
  { key: "fine_15", label: "11 – 15 min late" },
  { key: "fine_30", label: "16 – 30 min late (and beyond)" },
];

export function AttendanceFinesCard() {
  const [rules, setRules] = useState({ grace_minutes: 10, fine_5: 50, fine_10: 100, fine_15: 150, fine_30: 300 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/late-fines").then(r => setRules(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't load fine settings"));
  }, []);

  function setField(k, v) { setRules(r => ({ ...r, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        grace_minutes: Math.max(0, parseInt(rules.grace_minutes, 10) || 0),
        fine_5: Number(rules.fine_5) || 0,
        fine_10: Number(rules.fine_10) || 0,
        fine_15: Number(rules.fine_15) || 0,
        fine_30: Number(rules.fine_30) || 0,
      };
      const { data } = await api.put("/settings/late-fines", payload);
      setRules(data);
      toast.success("Late check-in fines updated");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save fines");
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="attendance-fines-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
          <AlarmClock className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Late check-in fines</h2>
          <p className="text-xs text-slate-500 mt-1">
            Decide how much is deducted from a staff member's salary when they check in late. Set any tier to ₹0 to make it fine-free.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div>
          <label className="text-xs text-slate-500 font-medium">Grace period (minutes)</label>
          <input data-testid="fine-grace-minutes" type="number" min="0" max="120" value={rules.grace_minutes}
            onChange={e => setField("grace_minutes", e.target.value)} className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">No fine if the staff checks in within this window after shift start.</p>
        </div>
        {TIERS.map(t => (
          <div key={t.key}>
            <label className="text-xs text-slate-500 font-medium">{t.label} — fine (₹)</label>
            <input data-testid={`${t.key.replace("_", "-")}-input`} type="number" min="0" step="10" value={rules[t.key]}
              onChange={e => setField(t.key, e.target.value)} className={inputCls} />
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          Lateness is measured from each staff member's shift start. Fines apply only to geo-verified check-ins and appear as salary deductions. You can always waive a wrongly applied fine from the Attendance page.
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button data-testid="fines-save-btn" onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold text-sm hover:from-rose-600 hover:to-pink-600 shadow-sm disabled:opacity-60">
          <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save fines"}
        </button>
      </div>
    </div>
  );
}

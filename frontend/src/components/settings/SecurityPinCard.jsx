import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { KeyRound, Save, Info } from "lucide-react";

const inputCls = "mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-sky-200";

export function SecurityPinCard() {
  const [isSet, setIsSet] = useState(null); // null = loading
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/security-pin").then(r => setIsSet(!!r.data.set)).catch(() => {});
  }, []);

  async function save() {
    if (!/^\d{4,6}$/.test(newPin)) { toast.error("PIN must be 4–6 digits"); return; }
    if (isSet && !currentPin) { toast.error("Enter your current PIN to change it"); return; }
    setSaving(true);
    try {
      await api.put("/settings/security-pin", { new_pin: newPin, current_pin: currentPin || null });
      toast.success(isSet ? "Security PIN changed" : "Security PIN set — staff changes are now protected 🔒");
      setIsSet(true); setCurrentPin(""); setNewPin("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save PIN");
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="security-pin-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Owner Security PIN</h2>
          <p className="text-xs text-slate-500 mt-1">
            Many staff share this admin login for billing. Set a secret PIN that only <b>you</b> know — it will be asked before anyone can add/edit/delete staff, change salaries, give advances or waive fines. It also lets you switch branches instantly (others need your OTP).
          </p>
        </div>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded font-semibold ${isSet === null ? "bg-slate-50 text-slate-400 border border-slate-200" : isSet ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`} data-testid="pin-status-badge">
          {isSet === null ? "Checking…" : isSet ? "PIN active" : "Not set"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        {isSet && (
          <div>
            <label className="text-xs text-slate-500 font-medium">Current PIN *</label>
            <input data-testid="pin-current-input" type="password" inputMode="numeric" maxLength={6}
              value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••" className={inputCls} />
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500 font-medium">{isSet ? "New PIN (4–6 digits) *" : "Set PIN (4–6 digits) *"}</label>
          <input data-testid="pin-new-input" type="password" inputMode="numeric" maxLength={6}
            value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••" className={inputCls} />
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>Keep this PIN private — don't share it with billing staff. If you forget it, contact HQ to reset.</div>
      </div>

      <div className="flex justify-end mt-6">
        <button data-testid="pin-save-btn" onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm shadow-sm disabled:opacity-60">
          <Save className="w-4 h-4" /> {saving ? "Saving…" : isSet ? "Change PIN" : "Set PIN"}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Lock, Loader2, ShieldCheck } from "lucide-react";

export const ManagerLockScreen = ({ path, label, onUnlocked }) => {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // logs the attempt; auto-unlocks if no PIN is configured
    api.post("/manager/section-access", { section: path })
      .then(r => { if (r.data.ok) onUnlocked(); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const unlock = async () => {
    if (!pin.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/manager/section-access", { section: path, pin: pin.trim() });
      if (data.ok) { toast.success(`${label} unlocked ✦`); onUnlocked(); }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Incorrect Admin PIN");
      setPin("");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6" data-testid="manager-lock-screen">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-xl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 flex items-center justify-center mb-5">
          <Lock className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="font-playfair text-2xl text-slate-900">{label} is protected</h2>
        <p className="text-sm text-slate-500 mt-2 mb-6">This section needs the <b>Admin PIN</b>. Ask the salon owner to unlock it — this visit has been logged.</p>
        <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && unlock()} data-testid="manager-pin-input"
          className="w-full border border-slate-200 bg-white text-slate-900 rounded-xl px-4 py-3 text-center text-xl tracking-[8px] focus:outline-none focus:border-slate-900 placeholder:text-slate-300"
          placeholder="••••" autoFocus />
        <button onClick={unlock} disabled={busy || !pin.trim()} data-testid="manager-pin-unlock-btn"
          className="mt-4 w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold py-3 rounded-xl hover:bg-slate-800 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Unlock with Admin PIN
        </button>
      </div>
    </div>
  );
};

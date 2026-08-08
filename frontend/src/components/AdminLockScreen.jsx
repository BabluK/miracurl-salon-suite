import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Lock, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";

// Owner-PIN gate for sensitive admin sections (Settings, Staff).
// Every attempt is logged (visible in Staff Activities). Auto-unlocks when no PIN is set.
// Wrong PIN (or backing out) returns the user to where they came from.
export const AdminLockScreen = ({ path, label, onUnlocked }) => {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/dashboard");
  };

  useEffect(() => {
    // logs the attempt; auto-unlocks if no PIN is configured
    api.post("/manager/section-access", { section: path })
      .then(r => { if (r.data.ok) onUnlocked(); else setChecking(false); })
      .catch(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const unlock = async () => {
    if (!pin.trim()) return;
    if (!/^\d{4,8}$/.test(pin.trim())) { toast.error("PIN must be 4–8 digits"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/manager/section-access", { section: path, pin: pin.trim() });
      if (data.ok) { toast.success(`${label} unlocked ✦`); onUnlocked(); }
    } catch (e) {
      toast.error(`${e.response?.data?.detail || "Incorrect Owner PIN"} — returning you back`);
      setPin("");
      setTimeout(goBack, 900);
    } finally { setBusy(false); }
  };

  if (checking) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-6 h-6 text-slate-300 animate-spin" /></div>;

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6" data-testid="admin-lock-screen">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-xl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 flex items-center justify-center mb-5">
          <Lock className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="font-playfair text-2xl text-slate-900">{label} is protected</h2>
        <p className="text-sm text-slate-500 mt-2 mb-6">Enter your <b>Owner PIN</b> to open this section on shared devices.</p>
        <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={e => e.key === "Enter" && unlock()} data-testid="admin-pin-input"
          className="w-full border border-slate-200 bg-white text-slate-900 rounded-xl px-4 py-3 text-center text-xl tracking-[8px] focus:outline-none focus:border-slate-900 placeholder:text-slate-300"
          placeholder="••••" autoFocus />
        <button onClick={unlock} disabled={busy || !pin.trim()} data-testid="admin-pin-unlock-btn"
          className="mt-4 w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold py-3 rounded-xl hover:bg-slate-800 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Unlock with Owner PIN
        </button>
        <button onClick={goBack} data-testid="admin-pin-go-back-btn"
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 py-2">
          <ArrowLeft className="w-4 h-4" /> Go back
        </button>
      </div>
    </div>
  );
};

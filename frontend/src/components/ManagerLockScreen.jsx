import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldX, KeyRound, X } from "lucide-react";

// Admin-PIN gate for managers. Shows a "not authorized" popup with two choices:
// Enter PIN (reveals the PIN pad) or Cancel (returns them to where they came from).
// Every visit and failed attempt is logged for the owner. No silent auto-unlock.
export const ManagerLockScreen = ({ path, label, onUnlocked }) => {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [noPinSet, setNoPinSet] = useState(false);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/dashboard");
  };
  const cancel = () => {
    toast.error("You don't have permission to visit this tab");
    goBack();
  };

  useEffect(() => {
    // logs the attempt for the owner; never auto-unlocks for managers
    api.post("/manager/section-access", { section: path })
      .then(r => {
        if (r.data.ok) onUnlocked();
        else if (r.data.no_pin_set) setNoPinSet(true);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const unlock = async () => {
    if (!pin.trim()) return;
    if (!/^\d{4,8}$/.test(pin.trim())) { toast.error("PIN must be 4–8 digits"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/manager/section-access", { section: path, pin: pin.trim() });
      if (data.ok) { toast.success(`${label} unlocked ✦`); onUnlocked(); }
      else {
        toast.error("Wrong Admin PIN (attempt logged)");
        setPin("");
      }
    } catch (e) {
      toast.error("You don't have permission to visit this tab — wrong Admin PIN (attempt logged)");
      setPin("");
      setTimeout(goBack, 900);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm" data-testid="manager-lock-screen">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-2xl animate-fade-up">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-5">
          <ShieldX className="w-7 h-7 text-rose-500" />
        </div>
        <h2 className="font-playfair text-2xl text-slate-900">Sorry, you're not authorized</h2>
        <p className="text-sm text-slate-500 mt-2 mb-6">
          <b>{label}</b> is locked by the salon owner and needs the <b>Admin PIN</b>. This visit has been logged.
        </p>

        {noPinSet && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 mb-4" data-testid="manager-no-pin-note">
            The owner hasn't set an Admin PIN yet — ask them to set one in Settings → Security PIN to grant access.
          </p>
        )}

        {showPin ? (
          <>
            <input type="password" autoComplete="one-time-code" name="owner-pin" inputMode="numeric" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => e.key === "Enter" && unlock()} data-testid="manager-pin-input"
              className="w-full border border-slate-200 bg-white text-slate-900 rounded-xl px-4 py-3 text-center text-xl tracking-[8px] focus:outline-none focus:border-slate-900 placeholder:text-slate-300"
              placeholder="••••" autoFocus />
            <button onClick={unlock} disabled={busy || !pin.trim()} data-testid="manager-pin-unlock-btn"
              className="mt-4 w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold py-3 rounded-xl hover:bg-slate-800 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Unlock with Admin PIN
            </button>
          </>
        ) : (
          <button onClick={() => setShowPin(true)} data-testid="manager-enter-pin-btn"
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold py-3 rounded-xl hover:bg-slate-800">
            <KeyRound className="w-4 h-4" /> Enter PIN
          </button>
        )}

        <button onClick={cancel} data-testid="manager-pin-cancel-btn"
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl py-3">
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  );
};

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, X } from "lucide-react";
import { passkeySupported, registerPasskey } from "@/lib/webauthn";

// Shown once after a one-time-code (or Google) login: one tap enables fingerprint / Face ID on this device.
export const PasskeyNudge = () => {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const flag = sessionStorage.getItem("pk_nudge");
    if (flag && passkeySupported() && !localStorage.getItem("pk_enrolled")) setShow(true);
  }, []);
  if (!show) return null;
  const close = () => { sessionStorage.removeItem("pk_nudge"); setShow(false); };
  const enable = async () => {
    setBusy(true);
    try { await registerPasskey(); toast.success("🔒 Fingerprint / Face ID login is on for this device"); localStorage.removeItem("pk_declined"); close(); }
    catch (e) { toast.error(e?.name === "NotAllowedError" ? "Cancelled — you can enable it later from the login page" : `Couldn't enable: ${e?.response?.data?.detail || e?.message || "try again"}`); setBusy(false); }
  };
  return (
    <div className="fixed bottom-28 right-5 z-[60] max-w-sm w-[calc(100%-2.5rem)] rounded-2xl bg-[#14100a] text-white shadow-2xl border border-[#d4af37]/40 p-4 animate-fade-up" data-testid="passkey-nudge">
      <button onClick={close} className="absolute top-2.5 right-2.5 text-white/60 hover:text-white" aria-label="Dismiss" data-testid="passkey-nudge-dismiss"><X className="w-4 h-4" /></button>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-[#d4af37]/20 flex items-center justify-center shrink-0"><Fingerprint className="w-6 h-6 text-[#e8c56a]" /></div>
        <div>
          <div className="font-semibold text-sm">Sign in instantly next time</div>
          <p className="text-xs text-white/75 mt-1">Enable fingerprint / Face ID on this device — no password or email code needed. It only works on your device and can't be phished.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={enable} disabled={busy} className="px-3.5 py-1.5 rounded-full bg-[#e8c56a] text-[#14100a] text-xs font-bold disabled:opacity-60" data-testid="passkey-nudge-enable">{busy ? "Waiting for your device…" : "Enable now"}</button>
            <button onClick={close} className="px-3 py-1.5 rounded-full text-xs font-semibold text-white/70 hover:text-white" data-testid="passkey-nudge-later">Later</button>
          </div>
        </div>
      </div>
    </div>
  );
};

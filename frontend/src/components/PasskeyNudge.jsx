import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, ScanFace, ShieldCheck, Smartphone, X, Loader2, ArrowRight, Check } from "lucide-react";
import { passkeySupported, registerPasskey } from "@/lib/webauthn";
import { useAuth } from "@/context/AuthContext";

const GOLD = "linear-gradient(135deg, #D4AF37 0%, #C9A24A 50%, #B8893A 100%)";
const STEPS = [
  [Fingerprint, "Tap Continue", "Your phone or laptop will ask for its fingerprint, Face ID or device PIN."],
  [ShieldCheck, "A passkey is created", "It lives only on this device and can't be phished, guessed or reused."],
  [Smartphone, "Next time: one touch", "Open Miracurl and sign in instantly — no password, no email code."],
];

// Branded pre-step shown once after login (password / one-time code / Google) BEFORE the browser's
// native "Create a passkey" sheet, so the OS dialog never appears out of nowhere.
export const PasskeyNudge = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const flag = sessionStorage.getItem("pk_nudge");
    if (flag && passkeySupported() && !localStorage.getItem("pk_enrolled")) setShow(true);
  }, []);
  if (!show) return null;
  const close = (declined = false) => { sessionStorage.removeItem("pk_nudge"); if (declined) localStorage.setItem("pk_declined", "1"); setShow(false); };
  const enable = async () => {
    setBusy(true);
    try {
      await registerPasskey();
      localStorage.removeItem("pk_declined");
      setDone(true);
      setTimeout(() => close(), 1600);
    } catch (e) {
      toast.error(e?.name === "NotAllowedError" ? "Cancelled — you can enable it any time from Settings → Security" : `Couldn't enable: ${e?.response?.data?.detail || e?.message || "try again"}`);
      setBusy(false);
    }
  };
  const host = typeof window !== "undefined" ? window.location.hostname : "miracurl-suite.com";
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6 bg-[#0F1E33]/45 backdrop-blur-sm" data-testid="passkey-nudge" onClick={() => !busy && close()}>
      <div className="relative w-full max-w-lg rounded-[24px] bg-[#FAF8F5] border border-[#E8E2D9] shadow-[0_30px_80px_rgba(15,30,51,0.35)] p-6 sm:p-8 text-[#0F1E33] animate-fade-up" onClick={e => e.stopPropagation()}>
        <button onClick={() => close()} disabled={busy} className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-[#6B7280] hover:bg-[#F3ECE3]" aria-label="Dismiss" data-testid="passkey-nudge-dismiss"><X className="w-4 h-4" /></button>
        <div className="flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-[#F9F3EA] text-[#B8893A] flex items-center justify-center shrink-0 shadow-[0_4px_20px_rgba(201,162,74,0.25)]">
            {done ? <Check className="w-7 h-7 text-emerald-600" /> : <ScanFace className="w-7 h-7" />}
          </span>
          <div>
            <div className="text-[10px] tracking-[0.3em] font-bold text-[#B8893A] uppercase">Miracurl Suite · Security</div>
            <h3 className="font-playfair text-2xl sm:text-3xl leading-tight mt-0.5">{done ? "Passkey created ✦" : "Create a passkey"}</h3>
          </div>
        </div>
        {done ? (
          <p className="mt-4 text-sm text-[#6B7280]">This device now signs in with fingerprint / Face ID. See it under Settings → Security anytime.</p>
        ) : (
          <>
            <p className="mt-4 text-sm sm:text-base text-[#6B7280] leading-relaxed">Sign in with your fingerprint or Face ID instead of a password — faster, and it only works on <b className="text-[#0F1E33]">this device</b>.</p>
            <div className="mt-5 space-y-3">
              {STEPS.map(([Icon, title, sub], i) => (
                <div key={title} className="flex items-start gap-3 rounded-2xl bg-white border border-[#E8E2D9] px-4 py-3">
                  <span className="w-9 h-9 rounded-full bg-[#F9F3EA] text-[#B8893A] flex items-center justify-center shrink-0 text-xs font-bold">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2"><Icon className="w-4 h-4 text-[#B8893A]" /> {title}</div>
                    <div className="text-xs text-[#6B7280] mt-0.5">{sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-[#F7F4EF] px-4 py-2.5 text-xs text-[#6B7280] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#B8893A] shrink-0" />
              <span>Passkey for <b className="text-[#0F1E33]">{host}</b> · {user?.email || "your account"}</span>
            </div>
            <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
              <button onClick={enable} disabled={busy} data-testid="passkey-nudge-enable"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl text-white font-semibold px-6 py-3 text-sm shadow-[0_4px_20px_rgba(201,162,74,0.28)] transition-transform hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0" style={{ background: GOLD }}>
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for your device…</> : <>Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
              <button onClick={() => close(true)} disabled={busy} data-testid="passkey-nudge-later"
                className="inline-flex items-center justify-center rounded-xl border border-[#E8E2D9] bg-white text-[#0F1E33] font-semibold px-6 py-3 text-sm hover:border-[#C9A24A]/60">Not now</button>
            </div>
            <p className="mt-3 text-[11px] text-[#9CA3AF] text-center">The next screen is shown by your device (Windows, Android or iPhone) — Miracurl never sees your fingerprint.</p>
          </>
        )}
      </div>
    </div>
  );
};

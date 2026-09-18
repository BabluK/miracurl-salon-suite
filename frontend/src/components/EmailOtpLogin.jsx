import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { KeyRound, Loader2 } from "lucide-react";

// Strong fallback after a wrong password: 6-digit code emailed to the account's own address.
export const EmailOtpLogin = ({ email, onSuccess }) => {
  const { refresh } = useAuth();
  const [stage, setStage] = useState("offer");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const request = async () => {
    if (!email) { setErr("Enter your email above first"); return; }
    setBusy(true); setErr("");
    try {
      await api.post("/auth/otp/request", { email });
      setStage("code"); toast.success("Code sent — check your inbox (valid 10 min)");
    } catch (e) { setErr(e.response?.data?.detail || "Couldn't send the code"); }
    finally { setBusy(false); }
  };
  const verify = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const { data } = await api.post("/auth/otp/verify", { email, code });
      await refresh?.();
      sessionStorage.setItem("pk_nudge", "1");
      toast.success("Welcome back ✦"); onSuccess(data.user);
    } catch (e2) { setErr(e2.response?.data?.detail || "That code isn't right"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3" data-testid="otp-login">
      {stage === "offer" ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-700"><b>Forgot your password?</b> Sign in with a one-time code sent to your registered email.</div>
          <button type="button" onClick={request} disabled={busy} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#14100a] text-[#e8c56a] text-xs font-semibold" data-testid="otp-request-btn">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />} Email me a code
          </button>
        </div>
      ) : (
        <form onSubmit={verify} className="flex items-center gap-2">
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm tracking-[0.3em] font-semibold" data-testid="otp-code-input" />
          <button type="submit" disabled={busy || code.length !== 6} className="px-3 py-2 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50" data-testid="otp-verify-btn">{busy ? "…" : "Sign in"}</button>
          <button type="button" onClick={request} disabled={busy} className="text-[11px] text-slate-500 underline" data-testid="otp-resend-btn">Resend</button>
        </form>
      )}
      {err && <div className="text-rose-600 text-xs mt-2" data-testid="otp-error">{err}</div>}
    </div>
  );
};

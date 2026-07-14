import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { KeyRound, Loader2, CheckCircle2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw !== pw2) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    try {
      await axios.post(`${BACKEND_URL}/api/auth/reset-password`, { token, new_password: pw });
      setDone(true);
      toast.success("Password updated — you can log in now!");
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Reset failed — request a new link");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#141118] text-white flex items-center justify-center p-4" data-testid="reset-password-page">
      <div className="w-full max-w-md rounded-3xl bg-white/[0.04] border border-white/10 p-8">
        {done ? (
          <div className="text-center py-6" data-testid="reset-password-success">
            <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
            <h1 className="font-playfair text-2xl">Password updated ✦</h1>
            <p className="text-white/50 text-sm mt-2">Taking you to login…</p>
          </div>
        ) : !token ? (
          <div className="text-center py-6">
            <h1 className="font-playfair text-2xl">Link missing or broken</h1>
            <p className="text-white/50 text-sm mt-2">Open the reset link from your email, or request a new one from the login page.</p>
            <Link to="/login" className="inline-block mt-5 text-amber-200 text-sm hover:underline">← Back to login</Link>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-amber-200 mb-1"><KeyRound className="w-5 h-5" /><span className="text-xs uppercase tracking-[0.25em]">Miracurl</span></div>
            <h1 className="font-playfair text-3xl">Set a new password</h1>
            <p className="text-white/50 text-sm mt-1 mb-6">Your login lock (if any) is cleared automatically.</p>
            <form onSubmit={submit} className="space-y-3">
              <input type="password" required minLength={8} placeholder="New password (min 8 chars)" value={pw}
                onChange={e => setPw(e.target.value)} data-testid="reset-password-input"
                className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-amber-200/50" />
              <input type="password" required placeholder="Confirm new password" value={pw2}
                onChange={e => setPw2(e.target.value)} data-testid="reset-password-confirm-input"
                className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-amber-200/50" />
              <button type="submit" disabled={busy} data-testid="reset-password-submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold py-3 hover:opacity-90 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Update password
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

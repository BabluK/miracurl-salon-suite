import { useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { KeyRound, Loader2, CheckCircle2, Eye, EyeOff, ShieldCheck, Check, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const RULES = [
  ["len", "At least 8 characters", (p) => p.length >= 8],
  ["upper", "An uppercase letter (A–Z)", (p) => /[A-Z]/.test(p)],
  ["lower", "A lowercase letter (a–z)", (p) => /[a-z]/.test(p)],
  ["digit", "A number (0–9)", (p) => /\d/.test(p)],
  ["symbol", "A symbol (!@#$…)", (p) => /[^A-Za-z0-9]/.test(p)],
];
const STRENGTH = [
  ["", "bg-slate-200"], ["Weak", "bg-rose-500"], ["Weak", "bg-rose-500"], ["Fair", "bg-amber-500"], ["Good", "bg-lime-500"], ["Strong", "bg-emerald-500"],
];

function PasswordField({ value, onChange, placeholder, testid, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} required value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus}
        data-testid={testid} autoComplete="new-password"
        className="w-full bg-[#fdf9f4] border border-[#e9d9ae] rounded-xl pl-4 pr-12 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#C89B52] focus:ring-2 focus:ring-[#C89B52]/20 transition-colors" />
      <button type="button" onClick={() => setShow(s => !s)} data-testid={`${testid}-toggle`} aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const passed = useMemo(() => RULES.filter(([, , ok]) => ok(pw)).length, [pw]);
  const strong = passed === RULES.length;
  const match = pw2.length > 0 && pw === pw2;
  const [label, bar] = STRENGTH[pw ? passed : 0];

  const submit = async (e) => {
    e.preventDefault();
    if (!strong) { toast.error("Please meet all password requirements"); return; }
    if (pw !== pw2) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    try {
      await axios.post(`${BACKEND_URL}/api/auth/reset-password`, { token, new_password: pw });
      setDone(true);
      toast.success("Password updated — you can sign in now!");
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Reset failed — request a new link");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 font-outfit" data-testid="reset-password-page"
      style={{ backgroundImage: "linear-gradient(135deg, rgba(253,247,242,.86) 0%, rgba(251,238,232,.82) 40%, rgba(247,241,230,.88) 100%), url(/assets/login/bg-salon.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_30px_80px_-30px_rgba(184,134,59,0.45)] ring-1 ring-[#efe3c4] p-7 sm:p-9 animate-fade-up">
        <div className="flex justify-center mb-6"><BrandMark variant="light" size="md" /></div>
        {done ? (
          <div className="text-center py-4" data-testid="reset-password-success">
            <span className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-9 h-9" /></span>
            <h1 className="font-playfair text-2xl text-slate-900">Password updated ✦</h1>
            <p className="text-slate-500 text-sm mt-2">Taking you to sign in…</p>
          </div>
        ) : !token ? (
          <div className="text-center py-4" data-testid="reset-password-missing">
            <h1 className="font-playfair text-2xl text-slate-900">Link missing or broken</h1>
            <p className="text-slate-500 text-sm mt-2">Open the reset link from your email, or request a new one from the sign-in page.</p>
            <Link to="/login" className="inline-block mt-5 text-[#a87e2f] text-sm font-semibold hover:underline">← Back to sign in</Link>
          </div>
        ) : (
          <>
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] font-bold text-[#a87e2f] bg-amber-50 border border-amber-100 rounded-full px-3 py-1"><KeyRound className="w-3 h-3" /> Password reset</div>
            <h1 className="font-playfair text-3xl text-slate-900 mt-3">Set a strong new password</h1>
            <p className="text-slate-500 text-sm mt-1.5 mb-6">Any login lock on your account is cleared automatically.</p>
            <form onSubmit={submit} className="space-y-3" noValidate>
              <PasswordField value={pw} onChange={e => setPw(e.target.value)} placeholder="New password" testid="reset-password-input" autoFocus />
              <div data-testid="password-strength">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(i => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${pw && i <= passed ? bar : "bg-slate-200"}`} />)}
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px]">
                  <span className="text-slate-400">Password strength</span>
                  <span className={`font-semibold ${strong ? "text-emerald-600" : passed >= 3 ? "text-amber-600" : "text-rose-500"}`} data-testid="password-strength-label">{label || "—"}</span>
                </div>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-[#fdf9f4] border border-[#efe3c4] p-3" data-testid="password-rules">
                {RULES.map(([k, text, ok]) => {
                  const hit = ok(pw);
                  return (
                    <li key={k} data-testid={`rule-${k}`} data-ok={hit} className={`flex items-center gap-1.5 text-[11.5px] ${hit ? "text-emerald-700" : "text-slate-500"}`}>
                      {hit ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-slate-300" />} {text}
                    </li>
                  );
                })}
              </ul>
              <PasswordField value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" testid="reset-password-confirm-input" />
              {pw2.length > 0 && (
                <p className={`text-[11.5px] flex items-center gap-1.5 ${match ? "text-emerald-700" : "text-rose-500"}`} data-testid="password-match">
                  {match ? <><Check className="w-3.5 h-3.5" /> Passwords match</> : <><X className="w-3.5 h-3.5" /> Passwords don't match yet</>}
                </p>
              )}
              <button type="submit" disabled={busy || !strong || !match} data-testid="reset-password-submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#1c160c] text-sm font-bold py-3.5 shadow-[0_12px_30px_-12px_rgba(200,155,82,0.8)] hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-[filter,opacity]">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Update password
              </button>
            </form>
            <p className="text-center text-xs text-slate-400 mt-5">Remembered it? <Link to="/login" className="text-[#a87e2f] font-semibold hover:underline">Back to sign in</Link></p>
          </>
        )}
      </div>
    </div>
  );
}

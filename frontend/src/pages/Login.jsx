import { useState, useEffect } from "react";
import log from "@/lib/log";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import BrandMark from "@/components/BrandMark";
import InstallAppPrompt from "@/components/InstallAppPrompt";

// Users routinely log in from the same browser; if they opt in, we remember
// the *email only* (never the password) so the next visit is one field faster.
const REMEMBER_KEY = "miracurl_remember_email";
const SUBMIT_LABELS = { login: "Login", signup: "Create Account", forgot: "Send Reset Link" };

export default function Login() {
  const { login, register, forgot } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [remember, setRemember] = useState(false);
  const [personalEmail, setPersonalEmail] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch (e) {
      log.warn("[Login] localStorage read failed:", e);
    }
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    let res;
    if (mode === "login") res = await login(email, password);
    else if (mode === "signup") res = await register(name, email, password);
    else {
      res = await forgot(email, personalEmail);
      setBusy(false);
      if (res.ok) toast.success("If the details match our records, a reset link was sent to your personal email.");
      else setErr(res.error);
      return;
    }
    setBusy(false);
    if (res.ok) {
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch (err2) {
        log.warn("[Login] localStorage write failed:", err2);
      }
      toast.success("Welcome back ✦");
      nav("/dashboard");
    }
    else setErr(res.error || "Authentication failed");
  }

  const heading = mode === "login" ? "Welcome Back"
    : mode === "signup" ? "Create Account"
    : "Reset Password";

  return (
    <div className="min-h-screen relative overflow-hidden bg-white" data-testid="login-page">
      {/* Decorative rose-gold gradient blobs — matching the brand logo */}
      <div className="pointer-events-none absolute -right-32 -bottom-32 w-[640px] h-[640px] rounded-full opacity-90"
           style={{ background: "radial-gradient(circle at 30% 30%, #e8918f 0%, #d4af37 40%, #ec4899 75%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -left-40 -bottom-44 w-[520px] h-[520px] rounded-full opacity-80"
           style={{ background: "radial-gradient(circle at 60% 40%, #f5d78e 0%, #e8a0a8 45%, #d4af37 80%, transparent 100%)" }} />
      {/* AI sparkles drifting over the page */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {[["12%","18%","0s"],["85%","12%","1.2s"],["70%","30%","2.1s"],["20%","65%","0.7s"],["90%","55%","1.8s"],["45%","10%","2.6s"],["8%","42%","3.2s"],["60%","75%","1.5s"]].map(([l,t,d]) => (
          <span key={l+t} className="dash-sparkle dash-sparkle-gold" style={{ left: l, top: t, width: 5, height: 5, animationDelay: d, animationDuration: "4s" }} />
        ))}
      </div>

      {/* Brand mark — top-left */}
      <div className="relative z-10 px-8 pt-6 sm:px-14 sm:pt-10">
        <BrandMark variant="light" size="lg" />
      </div>

      {/* PWA install prompt — encourages install from the login screen so
          returning users can open the app in one tap. */}
      <InstallAppPrompt variant="app" />

      {/* Card */}
      <div className="relative z-10 flex items-start justify-center px-4 pt-10 pb-24 sm:pt-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.18)] ring-1 ring-slate-100 p-8 sm:p-10 animate-fade-up">
          <h1 className="text-center text-3xl sm:text-[2rem] font-semibold text-slate-800 tracking-tight" data-testid="login-heading">
            {heading}
          </h1>
          <p className="text-center text-[11px] uppercase tracking-[0.25em] mt-2 font-semibold" data-testid="login-ai-tagline">
            <span className="brand-ai-tag">✦ AI Powered Salon Suite ✦</span>
          </p>

          <form onSubmit={submit} className="mt-10 space-y-6">
            {mode === "signup" && (
              <Field
                label="Full Name"
                icon={User}
                testid="signup-name-input"
                value={name}
                onChange={setName}
                placeholder="Your name"
                required
              />
            )}

            <Field
              label={mode === "signup" ? "Email" : "Username"}
              icon={User}
              testid="login-email-input"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />

            {mode === "forgot" && (
              <>
                <div className="text-[13px] text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 leading-relaxed" data-testid="forgot-info-note">
                  <b>Staff?</b> Your login ID isn&apos;t a real inbox — the quickest fix is to <b>ask your salon owner to reset your password</b>.
                  Or enter your <b>personal Gmail</b> below: if it matches the email on your staff record (active staff only), we&apos;ll send the reset link there.
                </div>
                <Field
                  label="Your Personal Gmail"
                  icon={User}
                  testid="forgot-personal-email-input"
                  type="email"
                  value={personalEmail}
                  onChange={setPersonalEmail}
                  placeholder="yourname@gmail.com"
                />
              </>
            )}

            {mode !== "forgot" && (
              <Field
                label="Password"
                icon={Lock}
                testid="login-password-input"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                required
                trailing={
                  <button type="button" onClick={() => setShowPw(!showPw)} data-testid="toggle-password-visibility" className="text-slate-400 hover:text-slate-600 transition">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            )}

            {err && (
              <div className="text-rose-600 text-sm bg-rose-50 border border-rose-100 rounded-lg px-3 py-2" data-testid="login-error">
                {err}
              </div>
            )}

            {mode === "login" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none" data-testid="login-remember-label">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    data-testid="login-remember-checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-rose-500 focus:ring-rose-300"
                  />
                  Remember my email
                </label>
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setErr(""); }}
                  className="text-sm text-rose-500 hover:text-rose-600 underline-offset-4 hover:underline transition"
                  data-testid="forgot-password-link"
                >
                  Forgot Password
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="login-submit-btn"
              className="w-full py-3.5 rounded-xl text-white font-medium text-base
                         bg-gradient-to-r from-rose-400 via-pink-500 to-amber-500 hover:from-rose-500 hover:via-pink-600 hover:to-amber-600
                         shadow-[0_8px_20px_-6px_rgba(232,145,143,0.65)]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-all active:scale-[0.98]"
            >
              {busy ? "Please wait..." : SUBMIT_LABELS[mode] || "Login"}
            </button>
          </form>

          {mode === "login" ? (
            <p className="text-center text-sm text-slate-500 mt-8">
              New to Miracurl?{" "}
              <a href="/signup-salon" className="text-rose-500 hover:text-rose-600 font-semibold" data-testid="link-signup-salon">
                Start your salon&apos;s free trial →
              </a>
              <span className="block mt-2 text-xs text-slate-400">
                Already work at a salon?{" "}
                <button onClick={() => { setMode("signup"); setErr(""); }} className="text-rose-500 hover:text-rose-600 font-medium" data-testid="show-signup-btn">
                  Create a staff account
                </button>
              </span>
            </p>
          ) : (
            <p className="text-center text-sm text-slate-500 mt-8">
              <button onClick={() => { setMode("login"); setErr(""); }} className="text-rose-500 hover:text-rose-600 font-medium" data-testid="back-to-login-btn">
                ← Back to sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, testid, value, onChange, type = "text", placeholder, required, trailing }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-2">{label}</label>
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-rose-400" />
        </div>
        <input
          data-testid={testid}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full pl-14 pr-12 py-3.5 rounded-xl bg-rose-50/60 border border-rose-100
                     text-slate-800 placeholder:text-slate-400 text-sm
                     focus:outline-none focus:ring-2 focus:ring-rose-200 focus:bg-white focus:border-rose-300
                     transition-all"
        />
        {trailing && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
    </div>
  );
}

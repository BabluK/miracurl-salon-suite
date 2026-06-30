import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import BrandMark from "@/components/BrandMark";

export default function Login() {
  const { login, register, forgot } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("admin@miracurl.com");
  const [password, setPassword] = useState("Miracurl@123");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    let res;
    if (mode === "login") res = await login(email, password);
    else if (mode === "signup") res = await register(name, email, password);
    else {
      res = await forgot(email);
      setBusy(false);
      if (res.ok) toast.success("If the email exists, a reset link was sent.");
      else setErr(res.error);
      return;
    }
    setBusy(false);
    if (res.ok) { toast.success("Welcome back to Miracurl"); nav("/dashboard"); }
    else setErr(res.error || "Authentication failed");
  }

  const heading = mode === "login" ? "Welcome Back"
    : mode === "signup" ? "Create Account"
    : "Reset Password";

  return (
    <div className="min-h-screen relative overflow-hidden bg-white" data-testid="login-page">
      {/* Decorative gradient blobs — bottom-right & bottom-left, Respark style */}
      <div className="pointer-events-none absolute -right-32 -bottom-32 w-[640px] h-[640px] rounded-full opacity-90"
           style={{ background: "radial-gradient(circle at 30% 30%, #ec4899 0%, #d946ef 35%, #6366f1 70%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -left-40 -bottom-44 w-[520px] h-[520px] rounded-full opacity-80"
           style={{ background: "radial-gradient(circle at 60% 40%, #818cf8 0%, #a78bfa 40%, #ec4899 80%, transparent 100%)" }} />

      {/* Brand mark — top-left */}
      <div className="relative z-10 px-8 pt-6 sm:px-14 sm:pt-10">
        <BrandMark variant="light" size="lg" />
      </div>

      {/* Card */}
      <div className="relative z-10 flex items-start justify-center px-4 pt-10 pb-24 sm:pt-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.18)] ring-1 ring-slate-100 p-8 sm:p-10 animate-fade-up">
          <h1 className="text-center text-3xl sm:text-[2rem] font-semibold text-slate-800 tracking-tight" data-testid="login-heading">
            {heading}
          </h1>

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
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setErr(""); }}
                  className="text-sm text-sky-500 hover:text-sky-600 underline-offset-4 hover:underline transition"
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
                         bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600
                         shadow-[0_8px_20px_-6px_rgba(59,130,246,0.6)]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-all active:scale-[0.98]"
            >
              {busy ? "Please wait..." : (mode === "login" ? "Login" : mode === "signup" ? "Create Account" : "Send Reset Link")}
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
                <button onClick={() => { setMode("signup"); setErr(""); }} className="text-sky-500 hover:text-sky-600 font-medium" data-testid="show-signup-btn">
                  Create a staff account
                </button>
              </span>
            </p>
          ) : (
            <p className="text-center text-sm text-slate-500 mt-8">
              <button onClick={() => { setMode("login"); setErr(""); }} className="text-sky-500 hover:text-sky-600 font-medium" data-testid="back-to-login-btn">
                ← Back to sign in
              </button>
            </p>
          )}

          <div className="mt-8 pt-5 border-t border-slate-100 text-[11px] text-slate-400 text-center font-mono">
            Demo: admin@miracurl.com / Miracurl@123
          </div>
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
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-sky-500" />
        </div>
        <input
          data-testid={testid}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full pl-14 pr-12 py-3.5 rounded-xl bg-sky-50/70 border border-sky-100
                     text-slate-800 placeholder:text-slate-400 text-sm
                     focus:outline-none focus:ring-2 focus:ring-sky-300 focus:bg-white focus:border-sky-300
                     transition-all"
        />
        {trailing && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
    </div>
  );
}

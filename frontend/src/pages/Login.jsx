import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Scissors, Eye, EyeOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";

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

  return (
    <div className="min-h-screen flex bg-bg-base relative overflow-hidden">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img
          src="https://images.unsplash.com/photo-1759142235060-3191ee596c81?w=1600"
          alt="Salon"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/40 to-black/70" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gold flex items-center justify-center shadow-gold-glow">
              <Scissors className="w-6 h-6 text-bg-base" />
            </div>
            <div>
              <div className="font-playfair text-2xl text-white">Miracurl</div>
              <div className="text-xs tracking-[0.3em] uppercase text-gold">Unisex Family Salon</div>
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="font-playfair text-5xl xl:text-6xl text-white leading-tight">
              Where elegance<br /><span className="text-gold italic">meets every strand.</span>
            </h1>
            <p className="text-white/70 max-w-md font-outfit">
              The complete management suite for modern luxury salons — appointments, clients, billing & analytics, all in one.
            </p>
          </div>
          <div className="text-white/40 text-xs tracking-widest uppercase">© Miracurl • Marathahalli</div>
        </div>
      </div>

      {/* Right: Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center">
              <Scissors className="w-5 h-5 text-bg-base" />
            </div>
            <span className="font-playfair text-2xl">Miracurl</span>
          </div>

          <h2 className="font-playfair text-4xl mb-2">
            {mode === "login" && "Welcome back"}
            {mode === "signup" && "Create account"}
            {mode === "forgot" && "Reset password"}
          </h2>
          <p className="text-ink-secondary mb-8">
            {mode === "login" && "Sign in to manage your salon."}
            {mode === "signup" && "Start your Miracurl journey."}
            {mode === "forgot" && "Enter your email to receive a reset link."}
          </p>

          <form onSubmit={submit} className="space-y-5">
            {mode === "signup" && (
              <div>
                <label className="label-luxe block mb-2">Full Name</label>
                <input data-testid="signup-name-input" className="input-luxe" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" />
              </div>
            )}
            <div>
              <label className="label-luxe block mb-2">Email</label>
              <input data-testid="login-email-input" type="email" className="input-luxe" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
            </div>
            {mode !== "forgot" && (
              <div>
                <label className="label-luxe block mb-2">Password</label>
                <div className="relative">
                  <input
                    data-testid="login-password-input"
                    type={showPw ? "text" : "password"}
                    className="input-luxe pr-12"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-gold transition" data-testid="toggle-password-visibility">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {err && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded px-3 py-2" data-testid="login-error">{err}</div>}

            <button data-testid="login-submit-btn" type="submit" disabled={busy} className="btn-gold w-full flex items-center justify-center gap-2 group">
              {busy ? "Please wait..." : (mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link")}
              {!busy && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <div className="mt-8 text-center space-y-3">
            {mode === "login" && (
              <>
                <button data-testid="forgot-password-link" onClick={() => { setMode("forgot"); setErr(""); }} className="text-sm text-gold hover:text-gold-hover">Forgot password?</button>
                <div className="text-sm text-ink-secondary">
                  New to Miracurl?{" "}
                  <button data-testid="show-signup-btn" onClick={() => { setMode("signup"); setErr(""); }} className="text-gold hover:underline">Create an account</button>
                </div>
              </>
            )}
            {mode !== "login" && (
              <button onClick={() => { setMode("login"); setErr(""); }} className="text-sm text-gold hover:underline" data-testid="back-to-login-btn">← Back to sign in</button>
            )}
          </div>

          <div className="mt-10 pt-6 border-t border-white/5 text-xs text-ink-muted text-center">
            Demo: admin@miracurl.com / Miracurl@123
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import log from "@/lib/log";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import BrandMark from "@/components/BrandMark";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import { passkeySupported, registerPasskey, loginWithPasskey } from "@/lib/webauthn";
import { SubscriptionBlockModal } from "@/components/SubscriptionBlockModal";

const FOOTER_FEATURES = [
  ["📅", "Appointments"], ["🧑‍🤝‍🧑", "Staff"], ["📦", "Inventory"], ["📣", "Marketing"],
  ["📊", "Reports"], ["🧾", "POS & Billing"], ["✨", "Mira AI"], ["🎬", "Promo Studio"],
  ["🤖", "AI Assistant"], ["🌐", "Online Booking"], ["🎁", "Gift Cards"], ["⭐", "Reviews"],
];

function LoginFeatureFooter() {
  return (
    <footer data-testid="login-feature-footer"
      className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-center gap-x-5 gap-y-1 overflow-x-auto sm:flex-wrap sm:justify-center scrollbar-none">
        {FOOTER_FEATURES.map(([icon, label]) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-slate-500 whitespace-nowrap py-0.5">
            <span className="text-sm">{icon}</span> {label}
          </span>
        ))}
      </div>
    </footer>
  );
}

// Users routinely log in from the same browser; if they opt in, we remember
// the *email only* (never the password) so the next visit is one field faster.
const REMEMBER_KEY = "miracurl_remember_email";
const SUBMIT_LABELS = { login: "Login", signup: "Create Account", forgot: "Send Reset Link" };

export default function Login() {
  const { login, register, forgot, refresh } = useAuth();
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
  const [farewell, setFarewell] = useState(false);
  const [blocked, setBlocked] = useState(null);

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
    if (mode === "login") res = await login(email, password, remember);
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
      if (passkeySupported() && !localStorage.getItem("pk_enrolled") && !localStorage.getItem("pk_declined")) {
        try {
          await registerPasskey();
          toast.success("🔒 Fingerprint / Face ID login enabled on this device");
        } catch { localStorage.setItem("pk_declined", "1"); }
      }
      nav("/dashboard");
    }
    else if (res.detail && typeof res.detail === "object" &&
             ["trial_expired", "subscription_expired", "suspended"].includes(res.detail.code)) setBlocked(res.detail);
    else if (String(res.error || "").includes("disabled by the salon admin")) setFarewell(true);
    else setErr(res.error || "Authentication failed");
  }

  if (farewell) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4" data-testid="login-farewell-screen">
        <div className="w-full max-w-md bg-white border border-rose-100 rounded-3xl shadow-[0_20px_60px_rgba(212,175,55,0.15)] p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-rose-100 to-amber-100 border border-amber-200 flex items-center justify-center text-3xl">🌸</div>
          <h2 className="font-playfair text-2xl text-slate-800 mt-5">Thank you for everything ✦</h2>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">
            Your salon account has been deactivated, so this app is no longer available to you.
          </p>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            If you believe this is a mistake — or you're joining a new salon — please contact your
            <b className="text-amber-600"> salon admin</b>. The moment you're re-activated, everything comes right back.
          </p>
          <p className="text-xs text-slate-400 mt-4 italic">We wish you the very best in your journey 💛</p>
          <button onClick={() => { setFarewell(false); setPassword(""); }} data-testid="login-farewell-back-btn"
            className="mt-6 px-6 py-2.5 rounded-full border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-slate-50 transition-colors">
            ← Back to login
          </button>
        </div>
      </div>
    );
  }

  const heading = mode === "login" ? "Welcome Back"
    : mode === "signup" ? "Create Account"
    : "Reset Password";

  return (
    <div className="min-h-screen relative overflow-hidden bg-white pb-16" data-testid="login-page">
      {blocked && <SubscriptionBlockModal info={blocked} onClose={() => setBlocked(null)} />}
      <LoginFeatureFooter />
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

      {/* Brand mark — top-left (absolute so the card centers in the viewport) */}
      <div className="absolute z-10 px-6 pt-5 sm:px-10 sm:pt-6">
        <BrandMark variant="light" size="lg" />
      </div>

      {/* PWA install prompt — encourages install from the login screen so
          returning users can open the app in one tap. */}
      <InstallAppPrompt variant="app" />

      {/* Card — vertically centered so Login is visible without scrolling */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.18)] ring-1 ring-slate-100 p-7 sm:p-8 animate-fade-up">
          <h1 className="text-center text-3xl sm:text-[2rem] font-semibold text-slate-800 tracking-tight" data-testid="login-heading">
            {heading}
          </h1>
          <p className="text-center text-[11px] uppercase tracking-[0.25em] mt-2 font-semibold" data-testid="login-ai-tagline">
            <span className="brand-ai-tag">✦ AI Powered Salon Suite ✦</span>
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
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
                  Keep me signed in on this device
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

          {mode === "login" && passkeySupported() && (
            <button
              type="button"
              data-testid="fingerprint-login-btn"
              onClick={async () => {
                setErr("");
                try {
                  const res = await loginWithPasskey(email);
                  await refresh?.();
                  toast.success(`Welcome back, ${res.user?.name || ""} ✦`);
                  window.location.href = (window.location.pathname.startsWith("/partner") ? "/partner" : "") + "/dashboard";
                } catch (e2) {
                  setErr(e2?.response?.data?.detail || "Fingerprint login didn't work — use your password (it re-enables fingerprint for this device)");
                }
              }}
              className="w-full mt-3 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm
                         flex items-center justify-center gap-2 hover:border-rose-300 hover:text-rose-600 transition-all active:scale-[0.98]"
            >
              <span className="text-lg">🔒</span> Login with Fingerprint / Face ID
            </button>
          )}

          {mode === "login" ? (
            <p className="text-center text-sm text-slate-500 mt-6">
              <span className="block mt-1 mb-1">New to Miracurl? Start your free trial —</span>
              <span className="inline-flex items-center gap-2">
                <a href="/signup-salon" data-testid="link-signup-salon"
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-semibold transition-colors">
                  ✂️ For Salons →
                </a>
                <a href="/signup-restaurant" data-testid="link-signup-restaurant"
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-semibold transition-colors">
                  🍽️ For Restaurants →
                </a>
              </span>
              <span className="block mt-2 text-xs text-slate-400">
                Already work at a salon?{" "}
                <button onClick={() => { setMode("signup"); setErr(""); }} className="text-rose-500 hover:text-rose-600 font-medium" data-testid="show-signup-btn">
                  Create a staff account
                </button>
              </span>
              <span className="block mt-3 text-[11px] text-slate-400">
                By continuing you agree to our{" "}
                <a href="/terms-of-service" className="underline hover:text-slate-600" data-testid="login-terms-link">Terms of Service</a>
                {" "}&{" "}
                <a href="/privacy-policy" className="underline hover:text-slate-600" data-testid="login-privacy-link">Privacy Policy</a>
              </span>
            </p>
          ) : (
            <p className="text-center text-sm text-slate-500 mt-6">
              <button onClick={() => { setMode("login"); setErr(""); }} className="text-rose-500 hover:text-rose-600 font-medium" data-testid="back-to-login-btn">
                ← Back to sign in
              </button>
              <span className="block mt-3 text-[11px] text-slate-400">
                By continuing you agree to our{" "}
                <a href="/terms-of-service" className="underline hover:text-slate-600">Terms of Service</a>
                {" "}&{" "}
                <a href="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</a>
              </span>
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

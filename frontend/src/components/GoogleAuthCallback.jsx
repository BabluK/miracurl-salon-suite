import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export function startGoogleLogin() {
  const redirectUrl = window.location.origin + "/dashboard";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}

export function GoogleAuthCallback() {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sid = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("session_id");
    window.history.replaceState(null, "", window.location.pathname);
    if (!sid) { navigate("/login", { replace: true }); return; }
    googleLogin(sid).then(r => {
      if (r.ok) sessionStorage.setItem("pk_nudge", "1");
      if (r.ok) navigate(r.user.role === "super_admin" ? "/super-admin" : "/dashboard", { replace: true, state: { user: r.user } });
      else setError(r.error || "Google sign-in failed");
    });
  }, [googleLogin, navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fbf7f2] p-6" data-testid="google-auth-callback">
      {error ? (
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="font-playfair text-2xl text-slate-900">Couldn't sign you in</div>
          <p className="text-sm text-slate-600 mt-3" data-testid="google-auth-error">{error}</p>
          <button onClick={() => navigate("/login", { replace: true })} className="mt-6 px-5 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold" data-testid="google-auth-back">Back to login</button>
        </div>
      ) : <Loader2 className="w-8 h-8 animate-spin text-[#b8860b]" />}
    </div>
  );
}

import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, Check } from "lucide-react";

/**
 * Full-screen forced password change shown to owners logging in for the very
 * first time (after super-admin onboarding, before they can access anything).
 * Only exits when the server clears must_change_password.
 */
export default function ForceChangePassword({ user }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const rules = {
    length: newPw.length >= 8,
    letter: /[a-zA-Z]/.test(newPw),
    number: /\d/.test(newPw),
    match: newPw && newPw === confirmPw,
    different: newPw && newPw !== currentPw,
  };
  const allOk = Object.values(rules).every(Boolean);

  async function submit(e) {
    e.preventDefault();
    if (!allOk) return;
    setBusy(true);
    setErr("");
    try {
      await api.post("/auth/change-password", { current_password: currentPw, new_password: newPw });
      toast.success("Password set ✦ Please log in with your new password");
      try { await api.post("/auth/logout"); } catch { /* session already invalid */ }
      window.location.href = "/login";
    } catch (e2) {
      const detail = e2?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : (e2?.message || "Couldn't change password");
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-rose-50 to-fuchsia-50 flex items-center justify-center p-4" data-testid="force-change-password-screen">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 flex items-center justify-center text-white mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.name?.split(" ")[0] || "there"} ✦</h1>
          <p className="text-sm text-slate-500 mt-2">
            Before you get started, please set your own password. Your one-time password won&apos;t work after this step.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Your one-time password</label>
            <input
              type="password"
              required
              autoFocus
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
              placeholder="Rose-Silk-472"
              data-testid="force-change-current-pw"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">New password</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                required
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
                placeholder="Something only you know"
                data-testid="force-change-new-pw"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showNew ? "Hide password" : "Show password"}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Confirm new password</label>
            <input
              type={showNew ? "text" : "password"}
              required
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
              placeholder="Type it again"
              data-testid="force-change-confirm-pw"
            />
          </div>

          <ul className="text-[11px] space-y-1 text-slate-600 pl-1" data-testid="force-change-rules">
            <Rule ok={rules.length}>At least 8 characters</Rule>
            <Rule ok={rules.letter}>Contains a letter</Rule>
            <Rule ok={rules.number}>Contains a number</Rule>
            <Rule ok={!!rules.different}>Different from the one-time password</Rule>
            <Rule ok={!!rules.match}>Both passwords match</Rule>
          </ul>

          {err && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" data-testid="force-change-error">{err}</div>}

          <button
            type="submit"
            disabled={!allOk || busy}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white font-semibold text-sm hover:from-rose-600 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            data-testid="force-change-submit"
          >
            {busy ? "Setting password…" : "Set new password & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Rule({ ok, children }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-emerald-600" : "text-slate-400"}`}>
      <Check className={`w-3.5 h-3.5 ${ok ? "opacity-100" : "opacity-30"}`} />
      {children}
    </li>
  );
}

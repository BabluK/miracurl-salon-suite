import { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { KeyRound, Eye, EyeOff } from "lucide-react";

export const ChangePasswordSection = () => {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (nw.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (nw !== confirm) { toast.error("New passwords don't match"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: nw });
      toast.success("Password changed ✦ Your login is now secured");
      setCur(""); setNw(""); setConfirm("");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't change password");
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="change-password-section">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Login Security</h2>
          <p className="text-xs text-slate-500 mt-0.5">Change your account password. Use a strong, unique password — especially replace any default demo password.</p>
        </div>
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
        <div className="relative">
          <label className="label-light block mb-1">Current password</label>
          <input data-testid="cur-password-input" type={show ? "text" : "password"} required className="input-light w-full" value={cur} onChange={e => setCur(e.target.value)} />
        </div>
        <div>
          <label className="label-light block mb-1">New password</label>
          <input data-testid="new-password-input" type={show ? "text" : "password"} required minLength={8} className="input-light w-full" value={nw} onChange={e => setNw(e.target.value)} />
        </div>
        <div>
          <label className="label-light block mb-1">Confirm new</label>
          <input data-testid="confirm-password-input" type={show ? "text" : "password"} required className="input-light w-full" value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        <div className="sm:col-span-3 flex items-center justify-between">
          <button type="button" onClick={() => setShow(s => !s)} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {show ? "Hide" : "Show"} passwords
          </button>
          <button data-testid="change-password-btn" disabled={saving} className="btn-blue">{saving ? "Updating…" : "Update Password"}</button>
        </div>
      </form>
    </div>
  );
};

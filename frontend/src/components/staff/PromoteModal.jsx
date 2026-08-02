import { useState } from "react";
import pinApi from "@/lib/ownerPin";
import { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { mainSalonLabel } from "@/lib/branch";
import { toast } from "sonner";
import { X, ShieldCheck } from "lucide-react";

export function PromoteModal({ staff, onClose, onDone }) {
  const { tenant } = useAuth();
  const branches = tenant?.branches || [];
  const hasLogin = !!staff.user_id;
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!hasLogin && !email.trim()) { toast.error("Enter a login email for them"); return; }
    setBusy(true);
    try {
      const { data } = await pinApi.post(`/staff/${staff.id}/promote`, { email: email.trim() || null, branch });
      if (data.mode === "created") {
        onDone({ name: staff.name, phone: staff.phone, email: data.email, temp_password: data.temp_password });
        toast.success(`👑 ${staff.name} is now a Manager — share the one-time password`);
      } else {
        onDone(null);
        toast.success(`👑 ${staff.name}'s existing login upgraded to Manager${branch ? ` (locked to ${branch})` : ""}`);
      }
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't promote");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="promote-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <div>
              <div className="font-bold text-sm">Promote {staff.name} to Manager</div>
              <div className="text-[10px] text-white/60">Attendance, commissions & history stay intact · PIN protected</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white" data-testid="promote-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {hasLogin ? (
            <p className="text-xs text-slate-600 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
              {staff.name} already has a portal login — it will simply be <b>upgraded to Manager</b>. Same email & password.
            </p>
          ) : (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Login email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="promote-email-input"
                className="input-light w-full mt-1 py-2.5" placeholder="name@yoursalon.com" />
              <p className="text-[10px] text-slate-400 mt-1">A one-time temporary password will be generated to share with them.</p>
            </div>
          )}
          {branches.length > 0 && (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Branch lock (optional)</label>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} data-testid="promote-branch-select"
                className="input-light w-full mt-1 py-2.5">
                <option value="">🌐 All branches (not locked)</option>
                <option value="__main__">🏠 {mainSalonLabel(tenant)} (Main)</option>
                {branches.map(b => <option key={b.id || b.name} value={b.name}>🔒 {b.name} only</option>)}
              </select>
            </div>
          )}
          <button onClick={submit} disabled={busy} data-testid="promote-submit"
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm rounded-xl py-3 transition-colors">
            {busy ? "Promoting…" : "🔒 Promote to Manager"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { GitBranch, KeyRound, UserCheck, X, Loader2 } from "lucide-react";

const inputCls = "w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200";

function PinTab({ onApproved }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!pin) return;
    setBusy(true);
    try {
      await api.post("/branch-switch/owner-pin", { pin });
      toast.success("Welcome, owner — branch switched ✦");
      onApproved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Incorrect PIN");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 space-y-3">
      <input data-testid="owner-pin-input" type="password" inputMode="numeric" maxLength={6}
        value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
        placeholder="Owner Security PIN" className={`${inputCls} font-mono tracking-[0.3em]`} />
      <button data-testid="owner-pin-submit" onClick={submit} disabled={busy || !pin}
        className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Verify & switch
      </button>
    </div>
  );
}

function OtpTab({ pendingBranch, onApproved }) {
  const [form, setForm] = useState({ name: "", phone: "", position: "" });
  const [reqInfo, setReqInfo] = useState(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp() {
    if (form.name.trim().length < 2 || form.phone.trim().length < 7 || form.position.trim().length < 2) {
      toast.error("Please fill your name, phone number and position"); return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/branch-switch/request", { ...form, branch: pendingBranch || "All branches" });
      setReqInfo(data);
      toast.success(data.email_sent
        ? `OTP sent to the owner (${data.owner_email}) — ask them for the code`
        : "Request created — the owner can see the OTP on their dashboard");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't create the request");
    } finally { setBusy(false); }
  }

  async function submitOtp() {
    if (!otp || !reqInfo) return;
    setBusy(true);
    try {
      await api.post("/branch-switch/verify", { request_id: reqInfo.request_id, otp });
      toast.success("Approved by owner — branch switched ✦");
      onApproved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Incorrect OTP");
    } finally { setBusy(false); }
  }

  if (!reqInfo) {
    return (
      <div className="mt-4 space-y-3">
        <input data-testid="switch-name-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name *" className={inputCls} />
        <input data-testid="switch-phone-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Your phone number *" className={inputCls} />
        <input data-testid="switch-position-input" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="Your position (e.g. Stylist, Manager) *" className={inputCls} />
        <button data-testid="switch-request-otp-btn" onClick={requestOtp} disabled={busy}
          className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Request OTP from owner
        </button>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
        📨 OTP sent to the owner{reqInfo.owner_email ? ` (${reqInfo.owner_email})` : ""}. Ask them for the 6-digit code — valid 10 minutes.
      </div>
      <input data-testid="switch-otp-input" inputMode="numeric" maxLength={6}
        value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
        placeholder="6-digit OTP" className={`${inputCls} font-mono tracking-[0.5em] text-center`} />
      <button data-testid="switch-otp-submit" onClick={submitOtp} disabled={busy || otp.length < 6}
        className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Verify OTP & switch
      </button>
    </div>
  );
}

// Verification modal: owner enters PIN, everyone else identifies + gets owner's OTP.
export function BranchSwitchModal({ pendingBranch, canUsePin, onClose, onApproved }) {
  const [tab, setTab] = useState(canUsePin ? "pin" : "otp");

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="branch-switch-modal">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-amber-500" /> Switch to {pendingBranch || "All branches"}
          </h3>
          <button data-testid="branch-switch-cancel" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500 mt-1">Branch switching is protected — verify who you are.</p>

        <div className="inline-flex rounded-full border border-slate-300 overflow-hidden mt-4">
          {canUsePin && (
            <button data-testid="tab-owner-pin" onClick={() => setTab("pin")}
              className={`text-xs px-3.5 py-1.5 font-medium flex items-center gap-1 ${tab === "pin" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <KeyRound className="w-3 h-3" /> I'm the owner
            </button>
          )}
          <button data-testid="tab-otp" onClick={() => setTab("otp")}
            className={`text-xs px-3.5 py-1.5 font-medium flex items-center gap-1 ${tab === "otp" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <UserCheck className="w-3 h-3" /> Get owner's OTP
          </button>
        </div>

        {tab === "pin"
          ? <PinTab onApproved={onApproved} />
          : <OtpTab pendingBranch={pendingBranch} onApproved={onApproved} />}
      </div>
    </div>
  );
}

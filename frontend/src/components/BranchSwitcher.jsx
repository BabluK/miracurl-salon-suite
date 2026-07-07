import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSelectedBranch, setSelectedBranch } from "@/lib/branch";
import api from "@/lib/api";
import { toast } from "sonner";
import { GitBranch, KeyRound, UserCheck, X, Loader2 } from "lucide-react";

const VERIFIED_KEY = "branch_switch_verified";

// Header dropdown: switching branches now requires the owner's PIN or an
// owner-approved OTP — anyone on the shared login must identify themselves.
export const BranchSwitcher = () => {
  const { tenant, user } = useAuth();
  const [value, setValue] = useState(getSelectedBranch());
  const branches = useMemo(() => tenant?.branches || [], [tenant]);
  const [pinSet, setPinSet] = useState(false);
  const [pending, setPending] = useState(null); // branch value awaiting approval
  const [tab, setTab] = useState("otp");
  const [busy, setBusy] = useState(false);
  // otp flow state
  const [form, setForm] = useState({ name: "", phone: "", position: "" });
  const [reqInfo, setReqInfo] = useState(null); // {request_id, owner_email}
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (value && branches.length && !branches.some(b => b.name === value)) {
      setValue(""); setSelectedBranch("");
    }
  }, [branches, value]);

  useEffect(() => {
    if (user?.role === "admin") {
      api.get("/settings/security-pin").then(r => setPinSet(!!r.data.set)).catch(() => {});
    }
  }, [user]);

  if (branches.length === 0) return null;

  function apply(v) {
    setValue(v); setSelectedBranch(v);
    setPending(null); setReqInfo(null); setOtp(""); setPin(""); setForm({ name: "", phone: "", position: "" });
  }

  function requestSwitch(v) {
    if (v === value) return;
    if (user?.role === "super_admin" || sessionStorage.getItem(VERIFIED_KEY) === "1") { apply(v); return; }
    setPending(v);
    setTab(pinSet && user?.role === "admin" ? "pin" : "otp");
  }

  async function submitPin() {
    if (!pin) return;
    setBusy(true);
    try {
      await api.post("/branch-switch/owner-pin", { pin });
      sessionStorage.setItem(VERIFIED_KEY, "1");
      toast.success("Welcome, owner — branch switched ✦");
      apply(pending);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Incorrect PIN");
    } finally { setBusy(false); }
  }

  async function requestOtp() {
    if (form.name.trim().length < 2 || form.phone.trim().length < 7 || form.position.trim().length < 2) {
      toast.error("Please fill your name, phone number and position"); return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/branch-switch/request", {
        ...form, branch: pending || "All branches",
      });
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
      sessionStorage.setItem(VERIFIED_KEY, "1");
      toast.success("Approved by owner — branch switched ✦");
      apply(pending);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Incorrect OTP");
    } finally { setBusy(false); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200";

  return (
    <>
      <div className="flex items-center gap-1.5" data-testid="branch-switcher">
        <GitBranch className="w-3.5 h-3.5 text-white/40 hidden sm:block" />
        <select
          data-testid="branch-switcher-select"
          value={value}
          onChange={e => requestSwitch(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/80 max-w-[150px] focus:outline-none"
          title="Switch branch — owner approval required"
        >
          <option value="">All branches</option>
          {branches.map(b => (
            <option key={b.id || b.name} value={b.name}>{b.name}</option>
          ))}
        </select>
      </div>

      {pending !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPending(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="branch-switch-modal">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-amber-500" /> Switch to {pending || "All branches"}
              </h3>
              <button data-testid="branch-switch-cancel" onClick={() => setPending(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Branch switching is protected — verify who you are.</p>

            <div className="inline-flex rounded-full border border-slate-300 overflow-hidden mt-4">
              {pinSet && user?.role === "admin" && (
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

            {tab === "pin" ? (
              <div className="mt-4 space-y-3">
                <input data-testid="owner-pin-input" type="password" inputMode="numeric" maxLength={6}
                  value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Owner Security PIN" className={`${inputCls} font-mono tracking-[0.3em]`} />
                <button data-testid="owner-pin-submit" onClick={submitPin} disabled={busy || !pin}
                  className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Verify & switch
                </button>
              </div>
            ) : !reqInfo ? (
              <div className="mt-4 space-y-3">
                <input data-testid="switch-name-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name *" className={inputCls} />
                <input data-testid="switch-phone-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Your phone number *" className={inputCls} />
                <input data-testid="switch-position-input" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="Your position (e.g. Stylist, Manager) *" className={inputCls} />
                <button data-testid="switch-request-otp-btn" onClick={requestOtp} disabled={busy}
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Request OTP from owner
                </button>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default BranchSwitcher;

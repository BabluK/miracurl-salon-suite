import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSelectedBranch, setSelectedBranch } from "@/lib/branch";
import api from "@/lib/api";
import { GitBranch } from "lucide-react";
import { BranchSwitchModal } from "@/components/BranchSwitchModal";

const VERIFIED_KEY = "branch_switch_verified";

// Header dropdown: switching branches requires the owner's PIN or an
// owner-approved OTP — anyone on the shared login must identify themselves.
export const BranchSwitcher = () => {
  const { tenant, user } = useAuth();
  const [value, setValue] = useState(getSelectedBranch());
  const branches = useMemo(() => tenant?.branches || [], [tenant]);
  const [pinSet, setPinSet] = useState(false);
  const [pending, setPending] = useState(null); // branch value awaiting approval

  useEffect(() => {
    if (value && branches.length && !branches.some(b => b.name === value)) {
      setValue(""); setSelectedBranch("");
    }
  }, [branches, value]);

  useEffect(() => {
    if (user?.role === "admin") {
      api.get("/settings/security-pin").then(r => setPinSet(!!r.data.set)).catch(() => setPinSet(false));
    }
  }, [user]);

  if (branches.length === 0) return null;

  function apply(v) {
    setValue(v);
    setSelectedBranch(v);
    setPending(null);
  }

  function requestSwitch(v) {
    if (v === value) return;
    const bypass = user?.role === "super_admin" || sessionStorage.getItem(VERIFIED_KEY) === "1";
    if (bypass) { apply(v); return; }
    setPending(v);
  }

  function onApproved() {
    sessionStorage.setItem(VERIFIED_KEY, "1");
    apply(pending);
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-shrink-0" data-testid="branch-switcher">
        <GitBranch className="w-3.5 h-3.5 text-white/40 hidden sm:block" />
        <select
          data-testid="branch-switcher-select"
          value={value}
          onChange={e => requestSwitch(e.target.value)}
          style={{ colorScheme: "dark" }}
          className="bg-white/5 border border-white/10 rounded-full px-2 sm:px-3 py-1 text-xs text-white/80 w-[64px] sm:w-auto sm:max-w-[150px] focus:outline-none"
          title="Switch branch — owner approval required"
        >
          <option value="" className="bg-neutral-900 text-white">All branches</option>
          {branches.map(b => (
            <option key={b.id || b.name} value={b.name} className="bg-neutral-900 text-white">{b.name}</option>
          ))}
        </select>
      </div>

      {pending !== null && (
        <BranchSwitchModal
          pendingBranch={pending}
          canUsePin={pinSet && user?.role === "admin"}
          onClose={() => setPending(null)}
          onApproved={onApproved}
        />
      )}
    </>
  );
};

export default BranchSwitcher;

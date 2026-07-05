import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSelectedBranch, setSelectedBranch } from "@/lib/branch";
import { GitBranch } from "lucide-react";

// Header dropdown: owner & manager switch which branch's numbers the dashboard shows.
export const BranchSwitcher = () => {
  const { tenant } = useAuth();
  const [value, setValue] = useState(getSelectedBranch());
  const branches = useMemo(() => tenant?.branches || [], [tenant]);

  useEffect(() => {
    // If the saved branch no longer exists, reset to all.
    if (value && branches.length && !branches.some(b => b.name === value)) {
      setValue(""); setSelectedBranch("");
    }
  }, [branches, value]);

  if (branches.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5" data-testid="branch-switcher">
      <GitBranch className="w-3.5 h-3.5 text-white/40 hidden sm:block" />
      <select
        data-testid="branch-switcher-select"
        value={value}
        onChange={e => { setValue(e.target.value); setSelectedBranch(e.target.value); }}
        className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/80 max-w-[150px] focus:outline-none"
        title="Switch branch — dashboard numbers follow"
      >
        <option value="">All branches</option>
        {branches.map(b => (
          <option key={b.id || b.name} value={b.name}>{b.name}</option>
        ))}
      </select>
    </div>
  );
};

export default BranchSwitcher;

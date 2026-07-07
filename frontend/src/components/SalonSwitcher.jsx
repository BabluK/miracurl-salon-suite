import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, ChevronDown, KeyRound } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Multi-salon owners: switch the active salon (Owner PIN confirms the switch).
export default function SalonSwitcher() {
  const { user } = useAuth();
  const [pinFor, setPinFor] = useState(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const salons = user?.salons || [];
  if (salons.length < 2) return null;
  const active = salons.find(s => s.id === user.tenant_id);

  async function doSwitch(tenantId, pinValue) {
    setBusy(true);
    try {
      const { data } = await api.post("/auth/switch-salon", { tenant_id: tenantId, pin: pinValue || undefined });
      toast.success(`Switched to ${data.active_salon?.name || "salon"} ✦`);
      window.location.href = "/dashboard";
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail === "OWNER_PIN_REQUIRED") setPinFor(tenantId);
      else toast.error(typeof detail === "string" ? detail : "Couldn't switch salon");
    } finally { setBusy(false); }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button data-testid="salon-switcher-btn"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Store className="w-3.5 h-3.5 text-fuchsia-500" />
            <span className="max-w-[110px] truncate">{active?.name || "My salons"}</span>
            <span className="text-[9px] px-1 rounded bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200">{salons.length}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {salons.map(s => (
            <DropdownMenuItem key={s.id} data-testid={`salon-option-${s.slug}`} disabled={busy}
              onClick={() => s.id !== user.tenant_id && doSwitch(s.id)}
              className={s.id === user.tenant_id ? "bg-fuchsia-50" : ""}>
              <Store className="w-3.5 h-3.5 mr-2 text-slate-400" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{s.name} {s.id === user.tenant_id && "• active"}</p>
                <p className="text-[10px] text-slate-400 truncate">{s.location || s.slug}</p>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {pinFor && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" data-testid="salon-switch-pin-modal">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-2xl">
            <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-500" /> Owner PIN required</p>
            <p className="text-[11px] text-slate-500 mt-1">Enter your Owner Security PIN to switch salons.</p>
            <input autoFocus data-testid="salon-switch-pin-input" type="password" inputMode="numeric" maxLength={6} value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && pin && doSwitch(pinFor, pin)}
              className="mt-3 w-full px-3 py-2 rounded-lg border border-slate-200 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-amber-200" />
            <div className="flex gap-2 mt-3">
              <button data-testid="salon-switch-pin-cancel" onClick={() => { setPinFor(null); setPin(""); }}
                className="flex-1 py-2 rounded-lg text-xs text-slate-500 border border-slate-200">Cancel</button>
              <button data-testid="salon-switch-pin-confirm" disabled={!pin || busy} onClick={() => doSwitch(pinFor, pin)}
                className="flex-1 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50">
                {busy ? "Switching…" : "Switch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import api, { setTenantSlug } from "@/lib/api";
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
      // Point the tenant-slug header at the NEW branch before reload,
      // otherwise every request 403s with "Cross-tenant access denied".
      if (data.active_salon?.slug) {
        setTenantSlug(data.active_salon.slug);
        localStorage.setItem("miracurl_tenant", data.active_salon.slug);
      }
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
            <span className="hidden sm:inline max-w-[220px] truncate">{active?.name || "My salons"}</span>
            <span className="text-[9px] px-1 rounded bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200">{salons.length}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[300px] max-w-[92vw] p-1.5 z-[110] bg-white text-slate-800 border border-slate-200 shadow-xl rounded-xl">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">My salons — tap to switch</div>
          {salons.map(s => {
            const isActive = s.id === user.tenant_id;
            return (
              <DropdownMenuItem key={s.id} data-testid={`salon-option-${s.slug}`} disabled={busy}
                onClick={() => !isActive && doSwitch(s.id)}
                className={`items-start gap-2.5 rounded-lg px-2.5 py-2.5 cursor-pointer ${isActive ? "bg-fuchsia-50 border border-fuchsia-200" : "hover:bg-slate-50"}`}>
                <Store className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? "text-fuchsia-500" : "text-slate-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-semibold text-slate-800 leading-snug break-words">{s.name}</p>
                    {isActive && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-500 text-white uppercase tracking-wider">Active</span>}
                  </div>
                  {s.location && <p className="text-[11px] text-slate-500 leading-snug break-words mt-0.5">{s.location}</p>}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {pinFor && createPortal(
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" data-testid="salon-switch-pin-modal">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-2xl">
            <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-500" /> Owner PIN required</p>
            <p className="text-[11px] text-slate-500 mt-1">Enter your Owner Security PIN to switch salons.</p>
            <input autoFocus data-testid="salon-switch-pin-input" type="password" autoComplete="one-time-code" name="owner-pin" inputMode="numeric" maxLength={6} value={pin}
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
        </div>,
        document.body
      )}
    </>
  );
}

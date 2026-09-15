import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { LifeBuoy } from "lucide-react";

export function SupportAccessCard() {
  const { tenant, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const on = tenant?.support_access !== false;
  const toggle = async () => {
    setBusy(true);
    try {
      await api.put("/settings/support-access", { enabled: !on });
      toast.success(!on ? "Miracurl support can help inside your workspace again" : "Support access switched off");
      refresh?.();
    } catch { toast.error("Could not update"); } finally { setBusy(false); }
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="support-access-card">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${on ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}><LifeBuoy className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800 flex-1">Miracurl support access</h2>
            <button data-testid="support-access-toggle" onClick={toggle} disabled={busy} aria-pressed={on}
              className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {on ? "Miracurl HQ can open your workspace to fix a setting or finish setup for you — no call or ticket needed. Every change they make is listed in your Audit log as “Miracurl Support”, you get a notification when they enter, and they can never delete your data or see Owner-PIN areas."
              : "Switched off: Miracurl HQ cannot open your workspace. Turn it on when you want hands-on help — it's the fastest way to get something fixed."}
          </p>
        </div>
      </div>
    </div>
  );
}

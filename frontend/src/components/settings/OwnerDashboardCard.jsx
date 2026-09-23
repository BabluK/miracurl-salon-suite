import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, KeyRound, Lock, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { PinDialog } from "@/components/dashboard/OwnerDashboardBits";

export function OwnerDashboardCard() {
  const nav = useNavigate();
  const [available, setAvailable] = useState(null);
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/owner-dashboard/status").then(r => setAvailable(!!r.data.available)).catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const remove = async (pin) => {
    setBusy(true);
    try {
      await api.post("/owner-dashboard/delete", { pin });
      toast.success("Owner Dashboard removed");
      setAvailable(false);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't remove"); }
    finally { setBusy(false); setAskDelete(false); }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl text-white p-6 mt-6 shadow-[0_30px_60px_-30px_rgba(37,99,235,.7)] bg-[linear-gradient(135deg,#2563eb_0%,#1d4ed8_45%,#0ea5e9_100%)]" data-testid="owner-dashboard-card">
      <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-white/15 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/75 font-semibold flex items-center gap-1.5"><Store className="w-3.5 h-3.5" /> Owner Dashboard</div>
          <p className="font-playfair text-2xl mt-1">AECS branch, one glance</p>
          <p className="text-sm text-white/80 mt-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Collections, cash, bookings & top stylist — PIN required.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button data-testid="owner-dashboard-open-btn" onClick={() => nav("/owner-dashboard")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-blue-700 text-sm font-bold hover:bg-blue-50 transition-[filter]">
            <KeyRound className="w-4 h-4" /> Open <ArrowRight className="w-4 h-4" />
          </button>
          <button data-testid="owner-dashboard-delete-btn" onClick={() => setAskDelete(true)} disabled={busy} title="Remove this dashboard"
            className="p-2.5 rounded-full bg-white/10 border border-white/15 text-white/70 hover:text-rose-300 hover:bg-white/20 transition-colors disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {askDelete && <PinDialog title="Remove Owner Dashboard" hint="Enter the dashboard PIN to remove it permanently." confirmLabel="Remove" danger busy={busy} onCancel={() => setAskDelete(false)} onConfirm={remove} testid="owner-dashboard-delete" />}
    </div>
  );
}

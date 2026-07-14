import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Eraser, Loader2, X, AlertTriangle } from "lucide-react";

export function DummyCleanupModal({ tenant, onClose }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/super-admin/dummy-data/${tenant.id}`).then(r => setPreview(r.data))
      .catch(() => { toast.error("Couldn't scan this salon"); onClose(); });
  }, [tenant.id, onClose]);

  const purge = async () => {
    if (!window.confirm(`Permanently delete ${preview.appointments} bookings and ${preview.customers} customers from ${tenant.name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/super-admin/dummy-data/${tenant.id}/purge`);
      toast.success(`Cleaned: ${data.removed.appointments} bookings, ${data.removed.customers} customers, ${data.removed.reviews} reviews`);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Cleanup failed");
    } finally { setBusy(false); }
  };

  const total = preview ? preview.appointments + preview.customers : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="dummy-cleanup-modal">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Eraser className="w-5 h-5 text-rose-500" /> Clean test data — {tenant.name}</h2>
          <button onClick={onClose} data-testid="dummy-cleanup-close" className="p-1.5 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500 mt-1">Finds bookings & customers with test/dummy names or invalid (non-10-digit) numbers. Invoices are never touched.</p>

        {!preview ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <div className="text-2xl font-bold text-rose-600" data-testid="dummy-appt-count">{preview.appointments}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Dummy bookings</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <div className="text-2xl font-bold text-rose-600" data-testid="dummy-cust-count">{preview.customers}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Dummy customers</div>
              </div>
            </div>
            {preview.customer_samples.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Sample customers</div>
                <div className="space-y-1 text-xs text-slate-600">
                  {preview.customer_samples.map((c, i) => <div key={i}>• {c.name} — {c.phone || "no phone"}</div>)}
                </div>
              </div>
            )}
            {preview.appointment_samples.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Sample bookings</div>
                <div className="space-y-1 text-xs text-slate-600">
                  {preview.appointment_samples.map((a, i) => <div key={i}>• {a.name} — {a.when ? new Date(a.when).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</div>)}
                </div>
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button onClick={purge} disabled={busy || total === 0} data-testid="dummy-cleanup-purge-btn"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                {total === 0 ? "Nothing to clean 🎉" : `Delete ${total} records`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

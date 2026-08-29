import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Eraser, Loader2, X, AlertTriangle } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

export function DummyCleanupModal({ tenant, onClose }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/super-admin/dummy-data/${tenant.id}`).then(r => setPreview(r.data))
      .catch(() => { toast.error("Couldn't scan this salon"); onClose(); });
  }, [tenant.id, onClose]);

  const purge = async () => {
    if (!await confirmAsync(`Permanently delete ${preview.appointments + (preview.orphan_appointments || 0)} bookings, ${preview.customers + (preview.ghost_customers || 0)} customers and ${preview.staff || 0} test staff from ${tenant.name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/super-admin/dummy-data/${tenant.id}/purge`);
      toast.success(`Cleaned: ${data.removed.appointments} bookings, ${data.removed.customers} customers, ${data.removed.reviews} reviews, ${data.removed.staff || 0} test staff`);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Cleanup failed");
    } finally { setBusy(false); }
  };

  const total = preview ? preview.appointments + preview.customers + (preview.ghost_customers || 0) + (preview.orphan_appointments || 0) + (preview.staff || 0) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="dummy-cleanup-modal">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Eraser className="w-5 h-5 text-rose-500" /> Clean test data — {tenant.name}</h2>
          <button onClick={onClose} data-testid="dummy-cleanup-close" className="p-1.5 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500 mt-1">Finds test/dummy NAMES, <b>ghost guests</b> (never completed a visit, no upcoming booking), <b>orphan bookings</b> (customer no longer exists) and <b>test staff</b> (name starts with TEST/DUMMY — incl. their attendance & late alerts). Customers with wallet money or invoices are never touched.</p>

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
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-center">
                <div className="text-2xl font-bold text-amber-600" data-testid="ghost-cust-count">{preview.ghost_customers || 0}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Ghost guests</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-center">
                <div className="text-2xl font-bold text-amber-600" data-testid="orphan-appt-count">{preview.orphan_appointments || 0}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Orphan bookings</div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 text-center col-span-2">
                <div className="text-2xl font-bold text-rose-600" data-testid="test-staff-count">{preview.staff || 0}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Test staff (+ their attendance)</div>
              </div>
            </div>
            {(preview.staff_samples || []).length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Test staff to remove</div>
                <div className="space-y-1 text-xs text-slate-600" data-testid="test-staff-samples">
                  {preview.staff_samples.map((s, i) => <div key={i}>• {s.name} — {s.role || "staff"}</div>)}
                </div>
              </div>
            )}
            {(preview.ghost_samples || []).length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Sample ghost guests (pending, never visited)</div>
                <div className="space-y-1 text-xs text-slate-600">
                  {preview.ghost_samples.map((c, i) => <div key={i}>• {c.name} — {c.phone || "no phone"}</div>)}
                </div>
              </div>
            )}
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

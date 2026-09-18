import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PowerOff, Loader2, ShieldCheck } from "lucide-react";

// One action: SMS/WhatsApp go OFF for every tenant except the ones you tick as approved.
export function ResetFeaturesModal({ open, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [keep, setKeep] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(null); setKeep({});
    api.get("/super-admin/features/enabled").then(r => setRows(r.data.tenants)).catch(() => toast.error("Couldn't load tenants"));
  }, [open]);

  const keepIds = Object.keys(keep).filter(k => keep[k]);
  const toOff = (rows || []).filter(r => !keep[r.id]).length;

  const run = async () => {
    if (!window.confirm(`Switch SMS & WhatsApp OFF for ${toOff} tenant(s)? ${keepIds.length} approved tenant(s) stay ON. You can re-enable any tenant later in Features.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/super-admin/features/reset", { keep_tenant_ids: keepIds });
      toast.success(`Switched OFF for ${data.switched_off} tenant(s) · ${data.kept} kept ON`);
      onDone?.(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Reset failed"); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="reset-features-modal">
        <DialogHeader><DialogTitle className="font-playfair text-2xl flex items-center gap-2 text-slate-900"><PowerOff className="w-5 h-5 text-rose-600" /> Reset SMS / WhatsApp flags</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">Tick the tenants you <b>approve</b> to keep sending. Everyone else is switched OFF and stays off until you enable them one by one.</p>
        {!rows ? <div className="py-8 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          : rows.length === 0 ? <div className="py-6 text-center text-emerald-700 text-sm" data-testid="reset-features-empty"><ShieldCheck className="w-5 h-5 inline mr-1" /> No tenant has SMS or WhatsApp switched on.</div>
          : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="reset-features-list">
              {rows.map(r => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" checked={!!keep[r.id]} onChange={e => setKeep(k => ({ ...k, [r.id]: e.target.checked }))} data-testid={`reset-keep-${r.id}`} className="w-4 h-4 accent-emerald-600" />
                  <span className="flex-1 truncate"><span className="font-medium text-slate-800">{r.name}</span> <span className="text-slate-400 text-xs">· {r.plan || "trial"}</span></span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.sms ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>SMS {r.sms ? "ON" : "off"} · {r.sms_points}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.whatsapp ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>WA {r.whatsapp ? "ON" : "off"} · {r.wa_points}</span>
                  <span className={`text-[11px] font-semibold ${keep[r.id] ? "text-emerald-700" : "text-rose-600"}`}>{keep[r.id] ? "keep ON" : "→ OFF"}</span>
                </li>
              ))}
            </ul>
          )}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">{keepIds.length} approved · {toOff} will be switched off</span>
          <button onClick={run} disabled={busy || !rows || rows.length === 0 || toOff === 0} data-testid="reset-features-run"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PowerOff className="w-4 h-4" />} Switch OFF {toOff} tenant{toOff === 1 ? "" : "s"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

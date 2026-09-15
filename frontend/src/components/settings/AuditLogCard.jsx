import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { confirmAsync } from "@/components/ConfirmDialog";
import { ShieldCheck, KeyRound, Eraser, Download, ChevronDown, Trash2 } from "lucide-react";

const ICON = { pin_used: KeyRound, erase: Eraser, export: Download };
const TONE = {
  pin_used: "bg-amber-50 text-amber-600 border-amber-100",
  erase: "bg-rose-50 text-rose-600 border-rose-100",
  export: "bg-sky-50 text-sky-600 border-sky-100",
};

export function AuditLogCard() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/settings/audit-log").then(r => setItems(r.data.items || [])).catch(() => setItems([]));
  }, []);

  if (items === null) return null;
  const shown = open ? items : items.slice(0, 5);
  async function clearAll() {
    if (!await confirmAsync("Delete ALL audit log entries? This cannot be undone.")) return;
    try {
      await api.delete("/settings/audit-log");
      setItems([]);
      toast.success("Audit log cleared ✦");
    } catch { toast.error("Couldn't clear the audit log"); }
  }
  return (
    <div id="audit-log" className="mt-6 bg-white border border-slate-200 rounded-2xl p-5" data-testid="audit-log-card">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <h3 className="font-semibold text-slate-800">Audit Log</h3>
        {items.length > 0 && (
          <button onClick={clearAll} data-testid="audit-log-clear-btn"
            className="ml-auto flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-700 font-semibold">
            <Trash2 className="w-3 h-3" /> Delete all
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-4">A trail of sensitive actions — every Owner PIN use, data erase and export is recorded here. Entries auto-delete after 7 days.</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-300 text-center py-4">Nothing recorded yet — sensitive actions will appear here.</p>
      ) : (
        <>
          <div className="space-y-2">
            {shown.map(ev => {
              const Icon = ICON[ev.action] || ShieldCheck;
              return (
                <div key={ev.id} className="flex items-start gap-3" data-testid={`audit-row-${ev.id}`}>
                  <span className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${TONE[ev.action] || "bg-slate-50 text-slate-500 border-slate-100"}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 leading-snug">{ev.detail}</p>
                    <p className="text-[10px] text-slate-400">
                      {ev.actor} ({ev.role}) · {new Date(ev.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {items.length > 5 && (
            <button onClick={() => setOpen(o => !o)} data-testid="audit-log-toggle"
              className="mt-3 text-xs text-sky-600 hover:underline flex items-center gap-1">
              {open ? "Show less" : `Show all ${items.length}`} <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

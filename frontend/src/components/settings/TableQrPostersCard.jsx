import { useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { QrCode, Download, Loader2 } from "lucide-react";

export function TableQrPostersCard() {
  const { tenant } = useAuth();
  const [tables, setTables] = useState(tenant?.table_count || 8);
  const [busy, setBusy] = useState(false);

  if (tenant?.business_type !== "restaurant") return null;

  const download = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/settings/table-qr-posters.pdf", {
        params: { tables: Number(tables) || 8, origin: window.location.origin },
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `table-qr-posters-${tables}-tables.pdf`;
      a.click();
      toast.success(`🖨️ ${tables} table posters downloaded — print, fold and place one on each table`);
    } catch {
      toast.error("Couldn't generate the posters — try again");
    }
    setBusy(false);
  };

  return (
    <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-5" data-testid="table-qr-posters-card">
      <h2 className="font-semibold text-slate-800 flex items-center gap-2">
        <QrCode className="w-4 h-4 text-amber-600" /> Table QR Posters
      </h2>
      <p className="text-xs text-slate-500 mt-1">
        Printable poster for every table — your logo, the table number and an order QR.
        Diners scan it, browse the menu and order straight to the kitchen.
      </p>
      <div className="flex items-end gap-3 mt-4">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-400">How many tables?</label>
          <input type="number" min="1" max="60" value={tables}
            onChange={e => setTables(e.target.value)}
            className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 w-28"
            data-testid="table-count-input" />
        </div>
        <button onClick={download} disabled={busy} data-testid="download-table-posters-btn"
          className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50 hover:bg-slate-700">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download {tables || 8} posters (PDF)
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-3">
        One A4 page per table (Table 1, 2, 3…). Each QR opens your menu with the table number pre-filled.
      </p>
    </div>
  );
}

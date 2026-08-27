import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { QrCode, Download, Loader2, ChefHat } from "lucide-react";

// Assign a chef/host per table — their name goes on QR-table bills and tips default to them
function TableChefAssignments({ tables }) {
  const [staff, setStaff] = useState([]);
  const [map, setMap] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/staff").then(r => setStaff(r.data || [])).catch(() => {});
    api.get("/settings/table-chefs").then(r => setMap(r.data.table_chefs || {})).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/table-chefs", { table_chefs: map });
      toast.success("Table chef assignments saved ✦ tips will default to each table's chef");
    } catch { toast.error("Save failed"); } finally { setSaving(false); }
  };

  if (!staff.length) return null;
  const n = Math.min(Number(tables) || 8, 60);
  return (
    <div className="mt-5 border-t border-slate-100 pt-4" data-testid="table-chef-assignments">
      <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <ChefHat className="w-4 h-4 text-amber-600" /> Chef per table
      </div>
      <p className="text-[11px] text-slate-400 mt-0.5">QR-table bills auto-assign this chef — tips go to them by default.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
        {Array.from({ length: n }, (_, i) => String(i + 1)).map(tno => (
          <label key={tno} className="flex items-center gap-1.5 text-xs">
            <span className="w-9 shrink-0 text-slate-500 font-semibold">T{tno}</span>
            <select value={map[tno] || ""} data-testid={`table-chef-select-${tno}`}
              onChange={e => setMap(m => ({ ...m, [tno]: e.target.value }))}
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
              <option value="">— any —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving} data-testid="table-chefs-save-btn"
        className="mt-3 px-4 py-1.5 rounded-full bg-slate-900 text-amber-300 text-xs font-semibold hover:bg-slate-800 disabled:opacity-50">
        {saving ? "Saving…" : "Save chef assignments"}
      </button>
    </div>
  );
}

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
      <TableChefAssignments tables={tables} />
    </div>
  );
}

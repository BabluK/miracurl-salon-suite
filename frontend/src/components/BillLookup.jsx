import { useState, useCallback, useEffect } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Search, Edit3, Loader2 } from "lucide-react";
import { EditInvoiceModal } from "@/components/EditInvoiceModal";

const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const localDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

export function BillLookup() {
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const search = useCallback(async (query = q, date = day) => {
    if (!query.trim() && !date) { setRows(null); return; }
    setBusy(true);
    try {
      const { data } = await api.get("/invoices", {
        params: { limit: 25, ...(query.trim() ? { q: query.trim() } : {}), ...(date ? { date } : {}) },
      });
      setRows(data);
      if (!data.length) toast.info("No bill matches that search");
    } catch { toast.error("Search failed"); }
    setBusy(false);
  }, [q, day]);

  useEffect(() => { if (day) search(q, day); }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (label, value, testid) => (
    <button type="button" data-testid={testid}
      onClick={() => setDay(d => (d === value ? "" : value))}
      className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition ${day === value
        ? "bg-slate-900 text-amber-200 border-slate-900 shadow"
        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
      {label}
    </button>
  );

  return (
    <div className="card-light p-5" data-testid="report-bill-lookup">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-playfair text-xl">Recent Invoices — Find & Edit a Bill</h2>
          <p className="text-xs text-slate-500 mt-0.5">Search by Booking / Invoice ID (e.g. INV-202608-0244), customer name or phone number — then edit customer & billing details.</p>
        </div>
        <div className="flex items-center gap-2">
          {chip("📅 Today", localDay(0), "bill-lookup-today")}
          {chip("Yesterday", localDay(-1), "bill-lookup-yesterday")}
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2 max-w-xl mt-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="bill-lookup-input" className="input-light pl-9 w-full" placeholder="Booking ID, customer name or phone…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button type="submit" disabled={busy} data-testid="bill-lookup-search-btn"
          className="px-5 py-2 rounded-full bg-slate-900 text-amber-200 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
        </button>
      </form>
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="luxe-table-light min-w-[680px]">
            <thead><tr><th>Booking ID</th><th>Customer</th><th>Date</th><th>Mode</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {rows.map(inv => (
                <tr key={inv.id} data-testid={`bill-lookup-row-${inv.id}`}>
                  <td className="font-mono text-xs font-semibold text-slate-700">{inv.invoice_no || inv.id.slice(0, 8).toUpperCase()}</td>
                  <td className="text-sm">{inv.customer_name || "Walk-in"}</td>
                  <td className="text-sm text-slate-500 whitespace-nowrap">{new Date(inv.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="text-xs uppercase text-slate-500">{inv.payment_mode || "—"}{inv.status === "voided" && <span className="ml-1 text-red-500">VOID</span>}</td>
                  <td className="text-sm font-semibold">{inr(inv.total)}</td>
                  <td>
                    <button data-testid={`bill-lookup-edit-${inv.id}`} onClick={() => setEditing(inv)}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-sky-400 hover:text-sky-600 transition">
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <EditInvoiceModal invoice={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); search(); }} />}
    </div>
  );
}

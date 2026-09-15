import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Receipt, Edit3, Search } from "lucide-react";
import { EditInvoiceModal } from "@/components/EditInvoiceModal";
import { usePager } from "@/components/crm/CrmBits";
const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function RecentInvoices() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const { paged, pager, resetPage } = usePager(rows, "invoices");

  const load = useCallback(() => {
    api.get("/invoices", { params: { limit: 500, month: 1, ...(q.trim() ? { q: q.trim() } : {}) } })
      .then(r => setRows(r.data)).catch(() => {});
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm mt-6" data-testid="crm-recent-invoices">
      <div className="flex items-center justify-between flex-wrap gap-3 p-5">
        <h2 className="font-playfair text-2xl text-slate-900 flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center"><Receipt className="w-5 h-5" /></span> Recent Invoices <span className="text-[10px] font-sans font-semibold text-slate-400 uppercase tracking-wide mt-1">this month</span></h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="crm-invoice-search" className="pl-9 w-64 py-2.5 rounded-xl border border-slate-200 text-sm !bg-white !text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#9b3a4e]/30" placeholder="Booking ID or customer…"
            value={q} onChange={e => { setQ(e.target.value); resetPage(); }} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="text-[10px] uppercase tracking-[0.2em] text-slate-500 bg-slate-50/70 border-y border-slate-100">{["Booking ID", "Customer", "Date", "Mode", "GST", "Total", ""].map((h, i) => <th key={i} className="text-left font-semibold px-4 py-3.5">{h}</th>)}</tr></thead>
          <tbody>
            {paged.map(inv => (
              <tr key={inv.id} data-testid={`crm-invoice-row-${inv.id}`} className="border-b border-slate-50 hover:bg-[#fdf6f7] transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">{inv.invoice_no || inv.id.slice(0, 8).toUpperCase()}</td>
                <td className="px-4 py-3">{inv.customer_name || "Walk-in"}{inv.customer_phone && <div className="text-xs text-slate-400">{inv.customer_phone}</div>}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(inv.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-4 py-3 text-xs uppercase text-slate-500">{inv.payment_mode || "—"}{inv.status === "voided" && <span className="ml-1 text-red-500">VOID</span>}{inv.status === "open" && <span className="ml-1 text-amber-600">OPEN</span>}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{(inv.tax || 0) > 0 ? inr(inv.tax) : "—"}</td>
                <td className="px-4 py-3 font-semibold">{inr(inv.total)}</td>
                <td className="px-4 py-3 text-right">
                  <button data-testid={`crm-invoice-edit-${inv.id}`} onClick={() => setEditing(inv)}
                    className="p-2 hover:bg-slate-50 rounded text-slate-500 hover:text-[#7f2d3f] transition" title="Edit bill"><Edit3 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && <tr><td colSpan="7" className="text-center text-slate-400 py-8 text-sm">No invoices found.</td></tr>}
          </tbody>
        </table>
      </div>
      {pager}
      {editing && <EditInvoiceModal invoice={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

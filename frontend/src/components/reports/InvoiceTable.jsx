import { Calendar, Edit3, ArrowUpDown } from "lucide-react";
import { inr, MODE_STYLE, MODE_LABEL, modeKey } from "./invoiceUtils";

const AVATAR = ["bg-rose-100 text-rose-600", "bg-sky-100 text-sky-600", "bg-violet-100 text-violet-600", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700"];
const COLS = [["invoice_no", "Booking ID"], ["customer_name", "Customer"], ["created_at", "Date & Time"], ["payment_mode", "Mode"], ["tax", "GST"], ["total", "Total"]];

export function InvoiceTable({ rows, sel, setSel, sort, setSort, onEdit, empty }) {
  const allOn = rows.length > 0 && rows.every(r => sel.has(r.id));
  const togglePage = () => setSel(s => { const n = new Set(s); rows.forEach(r => allOn ? n.delete(r.id) : n.add(r.id)); return n; });
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.2em] text-slate-500 bg-slate-50/70 border-y border-slate-100">
            <th className="px-4 py-3.5 w-10"><input type="checkbox" data-testid="bill-select-all" className="accent-[#9b3a4e] w-4 h-4" checked={allOn} onChange={togglePage} /></th>
            {COLS.map(([k, l]) => (
              <th key={k} className="text-left font-semibold px-4 py-3.5 whitespace-nowrap">
                <button data-testid={`bill-sort-${k}`} onClick={() => setSort(s => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" }))}
                  className={`inline-flex items-center gap-1 hover:text-[#7f2d3f] ${sort.key === k ? "text-[#7f2d3f]" : ""}`}>{l} <ArrowUpDown className="w-3 h-3 opacity-60" /></button>
              </th>
            ))}
            <th className="text-right font-semibold px-4 py-3.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(inv => {
            const name = inv.customer_name || "Walk-in", mk = modeKey(inv), dt = new Date(inv.created_at);
            return (
              <tr key={inv.id} data-testid={`bill-lookup-row-${inv.id}`} className={`border-b border-slate-50 hover:bg-[#fdf6f7] transition-colors ${sel.has(inv.id) ? "bg-[#fdf6f7]" : ""}`}>
                <td className="px-4 py-3"><input type="checkbox" data-testid={`bill-select-${inv.id}`} className="accent-[#9b3a4e] w-4 h-4" checked={sel.has(inv.id)} onChange={() => toggle(inv.id)} /></td>
                <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{inv.invoice_no || inv.id.slice(0, 8).toUpperCase()}
                  {inv.edit_count > 0 && <span className="ml-1.5 text-[9px] text-amber-500" title={`Edited by ${inv.last_edited_by}`}>✎</span>}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold ${AVATAR[name.charCodeAt(0) % AVATAR.length]}`}>{name.charAt(0).toUpperCase()}</div>
                    <div className="min-w-0"><div className="font-medium text-slate-800 truncate">{name}</div>
                      {inv.customer_phone && <div className="text-xs text-slate-500">{inv.customer_phone}</div>}</div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-[#9b3a4e]/70" />
                    <div><div className="text-slate-800">{dt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                      <div className="text-xs text-slate-400">{dt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })}
                        {inv.backdated && <span data-testid={`bill-backdated-${inv.id}`} className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500 text-white" title={`Raised late on ${new Date(inv.actual_created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`}>Back-dated</span>}
                      </div></div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${MODE_STYLE[mk]}`}>{MODE_LABEL[mk]}</span>
                  {inv.status === "voided" && <span className="ml-1.5 text-[10px] font-bold text-red-500">VOID</span>}
                  {inv.status === "open" && <span className="ml-1.5 text-[10px] font-bold text-amber-600">OPEN</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{(inv.tax || 0) > 0 ? inr(inv.tax) : "—"}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{inr(inv.total)}</td>
                <td className="px-4 py-3 text-right">
                  <button data-testid={`bill-lookup-edit-${inv.id}`} onClick={() => onEdit(inv)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:border-[#9b3a4e]/40 hover:text-[#7f2d3f] transition-colors">
                    <Edit3 className="w-3.5 h-3.5" /> Edit</button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan="8" className="text-center text-slate-500 py-12">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { FileSpreadsheet, Download } from "lucide-react";

// Super Admin → month-wise GST sales register with Excel export for the CA.
export const HqGstRegisterCard = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setData(null); api.get(`/hq/gst-register?month=${month}`).then(r => setData(r.data)).catch(() => toast.error("Couldn't load GST register")); }, [month]);
  const download = async () => {
    setBusy(true);
    try {
      const r = await api.get(`/hq/gst-register.xlsx?month=${month}`, { responseType: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(r.data); a.download = `miracurl-gst-register-${month}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
    } catch { toast.error("Export failed"); } finally { setBusy(false); }
  };
  const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  const t = data?.totals || {};
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-testid="hq-gst-register">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-700" /><h3 className="font-semibold text-slate-900">GST sales register</h3></div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" data-testid="gst-month">
            {(data?.summary?.length ? data.summary.map(s => s.month) : [month]).concat(data?.summary?.some(s => s.month === month) ? [] : [month]).sort().reverse().map(m => <option key={m} value={m}>{m}{(data?.summary || []).find(s => s.month === m) ? ` · ${(data.summary.find(s => s.month === m)).invoices} inv` : ""}</option>)}
          </select>
          <button onClick={download} disabled={busy || !data} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60" data-testid="gst-export"><Download className="w-3.5 h-3.5" /> {busy ? "Preparing…" : "Export Excel for CA"}</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {[["Invoices", data?.count ?? "—", ""], ["Taxable value", inr(t.taxable), ""], ["CGST", inr(t.cgst), ""], ["SGST", inr(t.sgst), ""], ["IGST", inr(t.igst), ""]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-slate-50 px-3 py-2" data-testid={`gst-total-${l.toLowerCase().replace(/\s/g, "-")}`}><div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div><div className="text-sm font-bold text-slate-900">{v}</div></div>
        ))}
      </div>
      {data === null ? <div className="h-20 animate-pulse bg-slate-50 rounded-xl" /> : data.rows.length === 0 ? (
        <div className="text-sm text-slate-500" data-testid="gst-empty">No invoices in {month}.</div>
      ) : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-xs" data-testid="gst-table">
            <thead className="bg-slate-50 sticky top-0"><tr className="text-left text-slate-500">{["Invoice", "Date", "Customer", "Type", "Taxable", "CGST", "SGST", "IGST", "Total"].map(h => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{data.rows.map(r => (
              <tr key={r.invoice_no} className="border-t border-slate-100"><td className="px-2 py-1.5 font-mono">{r.invoice_no}</td><td className="px-2 py-1.5">{r.date}</td><td className="px-2 py-1.5 truncate max-w-[180px]">{r.tenant}</td><td className="px-2 py-1.5">{r.kind}</td>
                <td className="px-2 py-1.5 text-right">{inr(r.taxable)}</td><td className="px-2 py-1.5 text-right">{inr(r.cgst)}</td><td className="px-2 py-1.5 text-right">{inr(r.sgst)}</td><td className="px-2 py-1.5 text-right">{inr(r.igst)}</td><td className="px-2 py-1.5 text-right font-semibold">{inr(r.total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="text-[11px] text-slate-400 mt-2">Grand total {inr(t.total)} · SAC 998314 · Excel has a second sheet with the month-wise summary.</div>
    </div>
  );
};

import { useState, useEffect, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Search, Loader2, Download, ChevronDown, FileText, Calendar } from "lucide-react";
import { EditInvoiceModal } from "@/components/EditInvoiceModal";
import { InvoiceTable } from "@/components/reports/InvoiceTable";
import { usePager, sortCustomers } from "@/components/crm/CrmBits";
import { RANGES, filterInvoices, downloadCsv } from "@/components/reports/invoiceUtils";

export function BillLookup() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [sel, setSel] = useState(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try { const { data } = await api.get("/invoices", { params: { limit: 500 } }); setRows(data); }
    catch { toast.error("Couldn't load invoices"); }
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => sortCustomers(filterInvoices(rows, { q, range, from, to }), sort), [rows, q, range, from, to, sort]);
  const { paged, pager, resetPage } = usePager(filtered, "invoices");
  const pick = (fn) => (v) => { fn(v); resetPage(); };

  const exportRows = (onlySelected) => {
    const out = onlySelected ? filtered.filter(r => sel.has(r.id)) : filtered;
    if (!out.length) { toast.info("Nothing to export"); return; }
    downloadCsv(out, `invoices-${range}.csv`); setExportOpen(false);
    toast.success(`${out.length} invoice${out.length === 1 ? "" : "s"} exported`);
  };

  const chip = (on) => `inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${on
    ? "bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white border-transparent shadow-[0_8px_20px_-10px_rgba(155,58,78,.8)]"
    : "bg-white text-slate-700 border-slate-200 hover:border-[#9b3a4e]/40"}`;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm" data-testid="report-bill-lookup">
      <div className="p-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-[#9b3a4e] flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5" /></div>
          <div>
            <h2 className="font-playfair text-2xl text-slate-900">Recent Invoices — Find &amp; Edit a Bill</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">Search by Booking / Invoice ID (e.g. INV-202608-0244), customer name or phone number — then edit customer &amp; billing details. Current month only — past months are locked.</p>
          </div>
        </div>
        <div className="relative">
          <button data-testid="bill-export-btn" onClick={() => setExportOpen(o => !o)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 hover:border-[#9b3a4e]/40 shadow-sm">
            <Download className="w-4 h-4" /> Export <ChevronDown className="w-4 h-4 text-slate-400" /></button>
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-lg z-20 py-1 text-sm" data-testid="bill-export-menu">
              <button data-testid="bill-export-all" onClick={() => exportRows(false)} className="w-full text-left px-4 py-2 hover:bg-[#fdf6f7]">CSV — all {filtered.length} in view</button>
              <button data-testid="bill-export-selected" onClick={() => exportRows(true)} disabled={!sel.size} className="w-full text-left px-4 py-2 hover:bg-[#fdf6f7] disabled:opacity-40">CSV — {sel.size} selected</button>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-4 flex items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap" data-testid="bill-range-chips">
          {RANGES.map(([k, l]) => (
            <button key={k} data-testid={`bill-range-${k}`} onClick={() => pick(setRange)(k)} className={chip(range === k)}>
              <Calendar className={`w-4 h-4 ${range === k ? "text-white" : "text-[#9b3a4e]"}`} /> {l}</button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <input type="date" data-testid="bill-range-from" className="input-light" value={from} onChange={e => pick(setFrom)(e.target.value)} /> to
            <input type="date" data-testid="bill-range-to" className="input-light" value={to} onChange={e => pick(setTo)(e.target.value)} />
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); load(); }} className="flex gap-2 flex-1 min-w-[280px] justify-end">
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input data-testid="bill-lookup-input" className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm !bg-white !text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#9b3a4e]/30"
              placeholder="Search by booking ID, customer name or phone…" value={q} onChange={e => pick(setQ)(e.target.value)} />
          </div>
          <button type="submit" disabled={busy} data-testid="bill-lookup-search-btn" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white text-sm font-semibold shadow-[0_10px_24px_-10px_rgba(155,58,78,.7)] hover:brightness-110 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search</button>
        </form>
      </div>

      <InvoiceTable rows={paged} sel={sel} setSel={setSel} sort={sort} setSort={setSort} onEdit={setEditing}
        empty={busy ? "Loading…" : rows.length ? "No bills match this range or search." : "No invoices yet."} />
      {pager}
      {editing && <EditInvoiceModal invoice={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

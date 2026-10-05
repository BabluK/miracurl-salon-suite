import { useMemo, useState } from "react";
import { Download, Table2, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZES = [25, 50, 100];
const PRIORITY = { HOT: ["🔥 High", "text-rose-700 bg-rose-50"], WARM: ["🟠 Warm", "text-orange-700 bg-orange-50"], COLD: ["🔵 Cold", "text-sky-700 bg-sky-50"] };

const COLS = [
  ["Priority", l => l.intent || "COLD"], ["Country", l => l.country || ""], ["City/Region", l => l.city || ""],
  ["Business", l => l.name || ""], ["Owner / Named contact", l => l.owner_name || ""], ["Public email", l => l.public_email || l.email || ""],
  ["WhatsApp", l => l.whatsapp || l.phone || ""], ["Website", l => l.website || l.social_url || ""],
  ["Booking / platform signal", l => l.platform_signal || ""], ["Why this lead fits Miracurl", l => l.fit_reason || ""],
  ["Suggested outreach angle", l => l.outreach_angle || ""], ["Email", l => (l.sent_at ? `sent ${l.sent_at.slice(0, 10)}` : l.status === "drafted" ? "drafted" : "—")],
  ["WhatsApp", l => (l.wa_intro_sent_at ? `sent ${l.wa_intro_sent_at.slice(0, 10)}` : "—")], ["Source", l => l.source || "google"],
];

const csvCell = (v) => { const s = String(v ?? ""); return /^[=+\-@]/.test(s) ? `'${s}` : s; };
function exportCsv(rows) {
  const lines = [COLS.map(c => c[0]).join(",")].concat(rows.map(l => COLS.map(([, f]) => `"${csvCell(f(l)).replace(/"/g, '""')}"`).join(",")));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `mira-leads-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

// Spreadsheet view of Mira's research — one row per lead, every column the Boss asked for, paginated.
export function LeadSheet({ leads, autopilotOn }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const pages = Math.max(1, Math.ceil(leads.length / size));
  const cur = Math.min(page, pages - 1);
  const rows = useMemo(() => leads.slice(cur * size, cur * size + size), [leads, cur, size]);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-testid="lead-sheet">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Table2 className="w-4 h-4 text-fuchsia-600" /> Lead sheet <span className="text-slate-400 font-normal">{leads.length} rows</span></div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${autopilotOn ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`} data-testid="lead-sheet-autopilot">
          Auto search & outreach: {autopilotOn ? "ON" : "OFF"}
        </span>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          Rows
          <select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }} data-testid="lead-sheet-size" className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={() => exportCsv(leads)} data-testid="lead-sheet-export" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1700px] w-full text-xs">
          <thead>
            <tr className="bg-[#0f172a] text-white">
              {COLS.map(([h]) => <th key={h} className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => {
              const [label, tone] = PRIORITY[l.intent] || PRIORITY.COLD;
              return (
                <tr key={l.id} className={`${i % 2 ? "bg-slate-50/60" : "bg-white"} border-b border-slate-100 align-top`} data-testid={`lead-sheet-row-${l.id}`}>
                  {COLS.map(([h, f], j) => {
                    const v = f(l);
                    if (j === 0) return <td key={h} className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${tone}`}>{label}</span></td>;
                    if (h === "Website" && v) return <td key={h} className="px-3 py-2 max-w-[200px] truncate"><a href={v} target="_blank" rel="noreferrer" className="text-sky-600 underline">{v.replace(/^https?:\/\//, "")}</a></td>;
                    return <td key={h} className={`px-3 py-2 text-slate-700 ${["Why this lead fits Miracurl", "Suggested outreach angle"].includes(h) ? "min-w-[260px] max-w-[340px]" : "max-w-[220px]"}`}>{v || <span className="text-slate-300">—</span>}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
        <span data-testid="lead-sheet-range">Showing {leads.length ? cur * size + 1 : 0}–{Math.min(leads.length, (cur + 1) * size)} of {leads.length}</span>
        <div className="flex items-center gap-1">
          <button disabled={cur === 0} onClick={() => setPage(p => p - 1)} data-testid="lead-sheet-prev" className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-2 font-semibold text-slate-700" data-testid="lead-sheet-page">Page {cur + 1} / {pages}</span>
          <button disabled={cur >= pages - 1} onClick={() => setPage(p => p + 1)} data-testid="lead-sheet-next" className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

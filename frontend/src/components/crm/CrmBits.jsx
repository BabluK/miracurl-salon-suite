import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";

const TONES = {
  rose: "bg-rose-50 text-rose-500", amber: "bg-amber-50 text-amber-500", emerald: "bg-emerald-50 text-emerald-600", pink: "bg-pink-50 text-pink-500",
};

export function CrmStat({ icon: Icon, tone = "rose", label, value, delta, sub }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 flex items-center gap-4" data-testid={`crm-stat-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${TONES[tone]}`}><Icon className="w-5 h-5" /></div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="font-playfair text-3xl text-slate-900 leading-tight">{value}</div>
          {delta && <span className="text-xs font-semibold text-emerald-600">↗ {delta}</span>}
        </div>
        {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

export function sortCustomers(rows, { key, dir }) {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[key] ?? "", vb = b[key] ?? "";
    if (typeof va === "number" || typeof vb === "number") return ((va || 0) - (vb || 0)) * m;
    return String(va).localeCompare(String(vb), undefined, { sensitivity: "base", numeric: true }) * m;
  });
}

function pages(total, cur) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, 3, 4, 5, total, cur - 1, cur, cur + 1].filter(p => p >= 1 && p <= total));
  const arr = [...set].sort((a, b) => a - b); const out = [];
  arr.forEach((p, i) => { if (i && p - arr[i - 1] > 1) out.push("…"); out.push(p); });
  return out;
}

export function CrmPager({ total, page, perPage, setPage, setPerPage, noun = "rows" }) {
  const last = Math.max(1, Math.ceil(total / perPage));
  const cur = Math.min(page, last);
  const from = total ? (cur - 1) * perPage + 1 : 0, to = Math.min(total, cur * perPage);
  const btn = "w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-[#9b3a4e]/40 disabled:opacity-40 disabled:hover:border-slate-200";
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-slate-100 text-sm text-slate-600" data-testid="crm-pager">
      <div>Showing {from}–{to} of {total} {noun}</div>
      <div className="flex items-center gap-1">
        <button className={btn} onClick={() => setPage(1)} disabled={cur === 1} data-testid="pager-first"><ChevronsLeft className="w-4 h-4" /></button>
        <button className={btn} onClick={() => setPage(cur - 1)} disabled={cur === 1} data-testid="pager-prev"><ChevronLeft className="w-4 h-4" /></button>
        {pages(last, cur).map((p, i) => p === "…" ? <span key={`e${i}`} className="px-1 text-slate-400">…</span> : (
          <button key={p} onClick={() => setPage(p)} data-testid={`pager-page-${p}`} className={`w-8 h-8 rounded-lg text-sm font-semibold ${p === cur ? "bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white shadow" : "border border-slate-200 text-slate-600 hover:border-[#9b3a4e]/40"}`}>{p}</button>
        ))}
        <button className={btn} onClick={() => setPage(cur + 1)} disabled={cur === last} data-testid="pager-next"><ChevronRight className="w-4 h-4" /></button>
        <button className={btn} onClick={() => setPage(last)} disabled={cur === last} data-testid="pager-last"><ChevronsRight className="w-4 h-4" /></button>
      </div>
      <div className="flex items-center gap-2">Show
        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} data-testid="pager-per-page" className="border border-slate-200 rounded-lg px-2 py-1 text-sm !bg-white !text-slate-800 appearance-auto">
          {[8, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
        </select> per page</div>
    </div>
  );
}

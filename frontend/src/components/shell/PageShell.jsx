import { Search, SlidersHorizontal, Download, Plus, Lightbulb, ArrowUpDown } from "lucide-react";

export const GOLD_BTN = "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#b8893a] to-[#8f6a2a] text-white text-sm font-semibold shadow-[0_10px_24px_-12px_rgba(143,106,42,.9)] hover:brightness-110 active:scale-[.98] transition disabled:opacity-50";
export const GHOST_BTN = "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:border-[#b8893a]/50 hover:text-[#8f6a2a] transition shadow-sm";

export function PageHeader({ title, subtitle, right, children, testid }) {
  return (
    <div className="flex items-start justify-between gap-6 flex-wrap" data-testid={testid}>
      <div className="min-w-0">
        <h1 className="font-playfair text-4xl sm:text-5xl text-slate-900 leading-[1.05]">{title}</h1>
        {subtitle && <p className="text-slate-500 text-base mt-2">{subtitle}</p>}
      </div>
      <div className="flex flex-col items-end gap-3 flex-1 min-w-[280px]">
        {right && <div className="flex items-center gap-3 flex-wrap justify-end">{right}</div>}
        {children && <div className="flex items-center gap-3 flex-wrap justify-end">{children}</div>}
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…", testid, className = "" }) {
  return (
    <label className={`relative block ${className}`}>
      <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input data-testid={testid} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-[#b8893a]/60 focus:ring-2 focus:ring-[#b8893a]/15" />
    </label>
  );
}

export function GhostBtn({ icon: Icon = SlidersHorizontal, children, active, ...props }) {
  return <button {...props} className={`${GHOST_BTN} ${active ? "border-[#b8893a] text-[#8f6a2a] bg-amber-50/60" : ""}`}><Icon className="w-4 h-4" /> {children}</button>;
}
export const FilterBtn = (p) => <GhostBtn icon={SlidersHorizontal} {...p} />;
export const ExportBtn = (p) => <GhostBtn icon={Download} {...p} />;
export function GoldBtn({ icon: Icon = Plus, children, ...props }) {
  return <button {...props} className={GOLD_BTN}>{Icon && <Icon className="w-4 h-4" />} {children}</button>;
}

export function SegmentTabs({ items, value, onChange, testPrefix }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200 shadow-sm">
      {items.map(({ key, label, icon: Icon }) => (
        <button key={key} data-testid={`${testPrefix}-${key}`} onClick={() => onChange(key)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${value === key ? "bg-gradient-to-r from-[#b8893a] to-[#8f6a2a] text-white font-semibold shadow" : "text-slate-600 hover:bg-slate-50"}`}>
          {Icon && <Icon className="w-4 h-4" />} {label}
        </button>
      ))}
    </div>
  );
}

const TONE = {
  gold: "bg-amber-50 text-[#b8893a]", emerald: "bg-emerald-50 text-emerald-600", rose: "bg-rose-50 text-rose-500",
  violet: "bg-violet-50 text-violet-600", sky: "bg-sky-50 text-sky-600", amber: "bg-yellow-50 text-yellow-600", slate: "bg-slate-100 text-slate-600",
};
export function KpiTile({ icon: Icon, tone = "gold", label, value, sub, testid }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5 flex items-start gap-4 min-w-0" data-testid={testid}>
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${TONE[tone]}`}><Icon className="w-6 h-6" strokeWidth={1.7} /></div>
      <div className="min-w-0">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="font-playfair text-3xl text-slate-900 leading-tight mt-0.5 truncate">{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
export function KpiStrip({ children, cols = 6 }) {
  return <div className={`grid gap-4 grid-cols-2 md:grid-cols-3 ${cols >= 6 ? "xl:grid-cols-6" : cols === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>{children}</div>;
}

export function TableCard({ children, className = "" }) {
  return <div className={`rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden ${className}`}>{children}</div>;
}
export function Th({ children, sortKey, sort, setSort, className = "", right }) {
  const active = sort?.key === sortKey;
  const toggle = () => sortKey && setSort(s => ({ key: sortKey, dir: s.key === sortKey && s.dir === "asc" ? "desc" : "asc" }));
  return (
    <th className={`px-5 py-4 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500 bg-slate-50/60 ${right ? "text-right" : "text-left"} ${className}`}>
      {sortKey ? (
        <button onClick={toggle} className={`inline-flex items-center gap-1.5 hover:text-slate-800 ${active ? "text-[#8f6a2a]" : ""}`} data-testid={`sort-${sortKey}`}>{children}<ArrowUpDown className="w-3 h-3" /></button>
      ) : children}
    </th>
  );
}
export function Avatar({ name, className = "" }) {
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase();
  return <span className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-50 text-[#8f6a2a] text-xs font-bold ring-1 ring-amber-200/60 ${className || "w-9 h-9"}`}>{initials}</span>;
}
export const STATUS_PILL = {
  scheduled: "bg-sky-50 text-sky-700 border-sky-200", confirmed: "bg-violet-50 text-violet-700 border-violet-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200", cancelled: "bg-red-50 text-red-600 border-red-200",
  no_show: "bg-amber-50 text-amber-700 border-amber-200", active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-100 text-slate-500 border-slate-200", low: "bg-amber-50 text-amber-700 border-amber-200", out: "bg-red-50 text-red-600 border-red-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200", open: "bg-amber-50 text-amber-700 border-amber-200", void: "bg-red-50 text-red-600 border-red-200",
};
export function StatusPill({ status, label, testid }) {
  return <span data-testid={testid} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold capitalize ${STATUS_PILL[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{label || String(status || "").replace("_", " ")}</span>;
}

export function EmptyState({ image, title, sub, children, testid }) {
  return (
    <div className="py-12 px-6 text-center" data-testid={testid}>
      {image && <img src={image} alt="" className="mx-auto w-52 h-40 object-contain drop-shadow-[0_18px_30px_rgba(143,106,42,.18)]" />}
      <h3 className="font-playfair text-2xl sm:text-3xl text-slate-900 mt-4">{title}</h3>
      {sub && <p className="text-slate-500 mt-2 max-w-xl mx-auto">{sub}</p>}
      {children && <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">{children}</div>}
    </div>
  );
}

export function ProTip({ title = "Pro Tip", text, action, testid }) {
  return (
    <div className="mx-4 mb-4 rounded-2xl bg-gradient-to-r from-amber-50/80 to-orange-50/40 border border-amber-100 px-5 py-4 flex items-center gap-4 flex-wrap" data-testid={testid}>
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#e8c56a] to-[#b8893a] text-white flex items-center justify-center shrink-0 shadow"><Lightbulb className="w-5 h-5" /></div>
      <div className="flex-1 min-w-[200px]">
        <div className="font-semibold text-slate-800">{title}</div>
        <div className="text-sm text-slate-500">{text}</div>
      </div>
      {action}
    </div>
  );
}

export function downloadCsv(rows, name) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => { const t = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(t) ? "'" + t : t).replace(/"/g, '""')}"`; };
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

import { MapPin, CalendarRange, CalendarDays, Users } from "lucide-react";
import { SectionCard, TH, THEAD, TR, TD } from "./SectionCard";

function MiniTable({ head, rows, testid }) {
  return (
    <div className="overflow-x-auto mt-4 rounded-2xl border border-slate-100">
      <table className="w-full text-sm">
        <thead className={THEAD}><tr>{head.map((h, i) => <th key={h} className={`${TH} ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(([key, ...cells]) => (
          <tr key={key} className={TR} data-testid={`${testid}-${key}`}>
            {cells.map((c, i) => <td key={i} className={`${TD} ${i ? "text-right" : "font-semibold text-slate-700"} ${i === cells.length - 1 ? "font-bold text-slate-800" : "text-slate-500"}`}>{c}</td>)}
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export function BranchPerformance({ data, inr }) {
  const rows = data.by_branch || [];
  if (!(rows.length > 1 || (rows.length === 1 && rows[0].branch !== "Main"))) return null;
  return (
    <SectionCard icon={MapPin} tone="sky" title="Branch Performance" subtitle="Compare your locations side by side · bills without a branch selected at the POS appear under “Main”." testid="branch-performance-card">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
        {rows.map(b => {
          const share = data.total_revenue ? (b.revenue / data.total_revenue) * 100 : 0;
          return (
            <div key={b.branch} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4" data-testid={`branch-perf-${b.branch}`}>
              <div className="text-sm font-semibold text-slate-700 truncate" title={b.branch}>{b.branch}</div>
              <div className="font-playfair text-3xl text-slate-900 mt-1.5">{inr(b.revenue)}</div>
              <div className="text-xs text-slate-500 mt-1">{b.invoices} bill{b.invoices === 1 ? "" : "s"} · avg {inr(b.invoices ? b.revenue / b.invoices : 0)}</div>
              <div className="mt-3 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#7f2d3f] to-[#c2536a]" style={{ width: `${share}%` }} /></div>
              <div className="text-[10px] text-slate-400 mt-1">{share.toFixed(0)}% of period revenue</div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function PeriodBreakdowns({ data, sym }) {
  const money = (n) => `${sym}${Number(n).toLocaleString("en-IN")}`;
  const f = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const months = (data.by_month || []).map(m => [m.month, new Date(m.month + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" }), m.invoices, money(m.revenue)]);
  const weeks = (data.by_week || []).map(w => { const s = new Date(w.week_start + "T00:00:00"), e = new Date(s); e.setDate(e.getDate() + 6); return [w.week_start, `${f(s)} – ${f(e)}`, w.invoices, money(w.revenue)]; });
  if (!months.length && !weeks.length) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {months.length > 0 && <SectionCard icon={CalendarRange} tone="emerald" title="Monthly Revenue" subtitle="Month by month" testid="monthly-revenue-card"><MiniTable head={["Month", "Bills", "Revenue"]} rows={months} testid="month-row" /></SectionCard>}
      {weeks.length > 0 && <SectionCard icon={CalendarDays} tone="sky" title="Weekly Revenue" subtitle="Week by week (Mon–Sun)" testid="weekly-revenue-card"><MiniTable head={["Week", "Bills", "Revenue"]} rows={weeks} testid="week-row" /></SectionCard>}
    </div>
  );
}

export function StaffBusiness({ data, sym }) {
  const rows = data.by_staff || [];
  if (!rows.length) return null;
  const total = rows.reduce((a, x) => a + x.revenue, 0);
  return (
    <SectionCard icon={Users} tone="violet" title="Staff Business — this period" subtitle="Team performance" testid="staff-business-card">
      <MiniTable head={["Staff", "Services / Items", "Share", "Business"]} testid="staff-biz-row"
        rows={rows.map((s, i) => [s.staff_id, <>{i === 0 ? "🏆 " : ""}{s.name}<span className="text-xs text-slate-400 font-normal">{s.role ? ` · ${s.role}` : ""}</span></>, s.items, `${total ? ((s.revenue / total) * 100).toFixed(0) : 0}%`, `${sym}${Number(s.revenue).toLocaleString("en-IN")}`])} />
    </SectionCard>
  );
}

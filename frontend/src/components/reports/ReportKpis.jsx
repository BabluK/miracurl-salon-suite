import { IndianRupee, FileText, Users, ShoppingBag, BarChart3, Receipt, Star, CreditCard } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { KpiCard, pctDelta } from "./KpiCard";

const PIE = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#e11d48"];
const fmtDay = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function TopKpis({ data, inr, CurIcon }) {
  const avg = data.total_invoices ? data.total_revenue / data.total_invoices : 0;
  const p = data.prev, pAvg = p && p.total_invoices ? p.total_revenue / p.total_invoices : null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" data-testid="report-top-kpis">
      <KpiCard testid="report-total-revenue" icon={CurIcon || IndianRupee} tone="emerald" label="Total Sales" value={inr(data.total_revenue)} delta={p ? pctDelta(data.total_revenue, p.total_revenue) : null}
        sub={data.gift_card_breakage > 0 ? <span data-testid="report-gift-breakage">+ {inr(data.gift_card_breakage)} gift-card breakage ({data.gift_cards_expired} expired)</span> : undefined} />
      <KpiCard testid="report-total-invoices" icon={FileText} tone="sky" label="Total Invoices" value={data.total_invoices} delta={p ? pctDelta(data.total_invoices, p.total_invoices) : null} />
      <KpiCard testid="report-unique-customers" icon={Users} tone="amber" label="Unique Customers" value={data.unique_customers || 0} delta={p ? pctDelta(data.unique_customers || 0, p.unique_customers) : null} />
      <KpiCard testid="report-avg-bill" icon={ShoppingBag} tone="rose" label="Avg. Bill Value" value={inr(avg)} delta={pAvg != null ? pctDelta(avg, pAvg) : null} />
    </div>
  );
}

export function TrendKpis({ data, inr, start, end }) {
  const weeks = [...(data.by_week || [])].reverse().map(w => ({ v: w.revenue, n: w.invoices }));
  const mix = data.by_payment_mode || [], mixTotal = mix.reduce((a, m) => a + m.amount, 0);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" data-testid="report-trend-kpis">
      <KpiCard testid="report-period-revenue" icon={BarChart3} tone="emerald" label="Period Revenue" value={inr(data.total_revenue)} sub={`${fmtDay(start)} – ${fmtDay(end)}`} spark={weeks} sparkKey="v" />
      <KpiCard testid="report-invoice-trend" icon={Receipt} tone="sky" label="Invoices Trend" value={data.total_invoices} sub={`avg ${inr(data.total_invoices ? data.total_revenue / data.total_invoices : 0)} per bill`} spark={weeks} sparkKey="n" />
      <KpiCard testid="report-avg-rating" icon={Star} tone="amber" label="Avg Rating"
        value={data.avg_rating != null ? <span className="flex items-center gap-2">{data.avg_rating} <span className="text-amber-400 text-lg tracking-tight">{"★".repeat(Math.round(data.avg_rating))}<span className="text-slate-200">{"★".repeat(5 - Math.round(data.avg_rating))}</span></span></span> : "—"}
        sub={`${data.review_count || 0} review${data.review_count === 1 ? "" : "s"} in period`} />
      <KpiCard testid="report-payment-mix" icon={CreditCard} tone="violet" label="Payment Mix" value={mix.length} sub={`payment mode${mix.length === 1 ? "" : "s"} used`}>
        {mix.length > 0 && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-20 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={mix} dataKey="amount" nameKey="mode" innerRadius={22} outerRadius={38} paddingAngle={2} isAnimationActive={false}>
                  {mix.map((m, i) => <Cell key={m.mode} fill={PIE[i % PIE.length]} />)}</Pie></PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1">
              {mix.slice(0, 4).map((m, i) => (
                <div key={m.mode} className="flex items-center gap-1.5 text-[11px] text-slate-600 whitespace-nowrap" data-testid={`pay-mix-${m.mode}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: PIE[i % PIE.length] }} /> <span className="capitalize">{m.mode.replace("salon_wallet", "wallet")}</span>
                  <span className="text-slate-400">{mixTotal ? Math.round((m.amount / mixTotal) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </KpiCard>
    </div>
  );
}

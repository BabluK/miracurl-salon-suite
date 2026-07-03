import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { IndianRupee, FileText, Users, Percent, MapPin } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["#0ea5e9", "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981"];
const PIE_TOOLTIP_STYLE = { background: "#fff", border: "1px solid #e2e8f0", color: "#0f172a" };

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [data, setData] = useState(null);
  const [commission, setCommission] = useState(null);
  const [pct, setPct] = useState(30);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      api.get(`/reports/sales?start=${start}&end=${end}`),
      api.get(`/reports/staff-commission?start=${start}&end=${end}&pct=${pct}`),
    ]);
    setData(a.data);
    setCommission(b.data);
  }, [start, end, pct]);
  useEffect(() => { load(); }, [load]);

  const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-playfair text-3xl">Sales Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Insights into salon performance and revenue.</p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="label-light block mb-1">From</label>
            <input data-testid="report-start" type="date" className="input-light" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label-light block mb-1">To</label>
            <input data-testid="report-end" type="date" className="input-light" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {!data ? <div className="text-slate-500">Loading...</div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="card-light" data-testid="report-total-revenue">
              <div className="label-light">Period Revenue</div>
              <div className="font-playfair text-4xl mt-2 text-sky-600 flex items-center"><IndianRupee className="w-7 h-7" />{data.total_revenue.toLocaleString("en-IN")}</div>
              <div className="text-xs text-slate-500 mt-2">from {start} to {end}</div>
            </div>
            <div className="card-light" data-testid="report-total-invoices">
              <div className="label-light">Total Invoices</div>
              <div className="font-playfair text-4xl mt-2">{data.total_invoices}</div>
              <div className="text-xs text-slate-500 mt-2">avg {inr(data.total_invoices ? data.total_revenue / data.total_invoices : 0)} per bill</div>
            </div>
            <div className="card-light">
              <div className="label-light">Payment Mix</div>
              <div className="font-playfair text-4xl mt-2">{data.by_payment_mode.length}</div>
              <div className="text-xs text-slate-500 mt-2">payment modes used</div>
            </div>
          </div>

          {/* Branch performance — shown once bills are branch-tagged */}
          {(data.by_branch || []).length > 0 && (data.by_branch.length > 1 || data.by_branch[0].branch !== "Main") && (
            <div className="card-light" data-testid="branch-performance-card">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-5 h-5 text-sky-500" />
                <h3 className="font-playfair text-xl">Branch Performance</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">Compare your locations side by side · bills without a branch selected at the POS appear under “Main”.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.by_branch.map(b => {
                  const share = data.total_revenue ? (b.revenue / data.total_revenue) * 100 : 0;
                  return (
                    <div key={b.branch} className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid={`branch-perf-${b.branch}`}>
                      <div className="text-sm font-semibold text-slate-700 truncate" title={b.branch}>{b.branch}</div>
                      <div className="font-playfair text-2xl text-sky-600 mt-1.5">{inr(b.revenue)}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {b.invoices} bill{b.invoices === 1 ? "" : "s"} · avg {inr(b.invoices ? b.revenue / b.invoices : 0)}
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500" style={{ width: `${share}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{share.toFixed(0)}% of period revenue</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="card-light">
              <div className="label-light">Revenue by Payment Mode</div>
              <div className="font-playfair text-xl mt-1 mb-3">Breakdown</div>
              {data.by_payment_mode.length === 0 ? <div className="text-slate-500 text-sm py-8 text-center">No data</div> : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                    <PieChart>
                      <Pie data={data.by_payment_mode} dataKey="amount" nameKey="mode" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {data.by_payment_mode.map((entry, i) => <Cell key={entry.mode} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={PIE_TOOLTIP_STYLE} formatter={(v) => inr(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card-light lg:col-span-2 p-0 overflow-hidden">
              <div className="p-4 flex items-center gap-2 border-b border-slate-100">
                <FileText className="w-4 h-4 text-sky-600" />
                <h3 className="font-playfair text-xl">Recent Invoices</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="luxe-table-light">
                  <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Mode</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {data.invoices.slice(0, 20).map(i => (
                      <tr key={i.id}>
                        <td className="font-mono text-xs">{i.invoice_no}</td>
                        <td className="text-xs text-slate-500">{new Date(i.created_at).toLocaleDateString()}</td>
                        <td>{i.customer_name}</td>
                        <td><span className="text-[10px] uppercase tracking-wider text-sky-600">{i.payment_mode}</span></td>
                        <td className="text-right text-sky-600">{inr(i.total)}</td>
                      </tr>
                    ))}
                    {data.invoices.length === 0 && <tr><td colSpan="5" className="text-center py-8 text-slate-500">No invoices in range</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Per-staff commission */}
          <div className="card-light p-0 overflow-hidden" data-testid="commission-card">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-600" />
                <h3 className="font-playfair text-xl">Per-Stylist Commission</h3>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 uppercase tracking-wider">Rate</label>
                <div className="relative">
                  <input
                    data-testid="commission-pct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={pct}
                    onChange={e => setPct(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
                    className="text-slate-800 w-20 pl-2 pr-7 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                  <Percent className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            {commission && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <Mini label="Total gross" value={inr(commission.total_gross)} />
                  <Mini label="Total commission" value={inr(commission.total_commission)} accent="text-sky-600" />
                  <Mini label="Stylists earning" value={commission.rows.length} />
                  <Mini label="Unassigned gross" value={inr(commission.unassigned.gross_revenue)} hint={commission.unassigned.gross_revenue > 0 ? "lines without staff_id" : ""} />
                </div>
                <div className="overflow-x-auto">
                  <table className="luxe-table-light">
                    <thead>
                      <tr>
                        <th>Stylist</th>
                        <th>Role</th>
                        <th className="text-right">Items</th>
                        <th className="text-right">Gross Revenue</th>
                        <th className="text-right">Commission ({pct}%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commission.rows.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-8 text-slate-500">No staff-attributed sales in this range yet. Tip: assign a Stylist on each POS cart line and the data lights up here.</td></tr>
                      ) : commission.rows.map(r => (
                        <tr key={r.staff_id} data-testid={`commission-row-${r.staff_id}`}>
                          <td className="text-slate-800 font-medium">{r.staff_name}</td>
                          <td className="text-xs text-slate-500">{r.role || "—"}</td>
                          <td className="text-right text-slate-700">{r.item_count} <span className="text-[10px] text-slate-400">({r.service_count}s · {r.product_count}p)</span></td>
                          <td className="text-right text-slate-800 font-medium">{inr(r.gross_revenue)}</td>
                          <td className="text-right text-sky-600 font-semibold">{inr(r.commission_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, value, accent = "text-slate-800", hint }) {
  return (
    <div>
      <div className="label-light text-[10px]">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${accent}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

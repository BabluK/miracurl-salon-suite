import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { IndianRupee, FileText } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["#D4AF37", "#E8C5C8", "#8A6D70", "#F0C847", "#A1A1AA"];

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/reports/sales?start=${start}&end=${end}`);
    setData(data);
  }, [start, end]);
  useEffect(() => { load(); }, [load]);

  const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-playfair text-3xl">Sales Reports</h1>
          <p className="text-ink-secondary text-sm mt-1">Insights into salon performance and revenue.</p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="label-luxe block mb-1">From</label>
            <input data-testid="report-start" type="date" className="input-luxe" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label-luxe block mb-1">To</label>
            <input data-testid="report-end" type="date" className="input-luxe" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {!data ? <div className="text-ink-secondary">Loading...</div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="card-luxe" data-testid="report-total-revenue">
              <div className="label-luxe">Period Revenue</div>
              <div className="font-playfair text-4xl mt-2 gold-text flex items-center"><IndianRupee className="w-7 h-7" />{data.total_revenue.toLocaleString("en-IN")}</div>
              <div className="text-xs text-ink-secondary mt-2">from {start} to {end}</div>
            </div>
            <div className="card-luxe" data-testid="report-total-invoices">
              <div className="label-luxe">Total Invoices</div>
              <div className="font-playfair text-4xl mt-2">{data.total_invoices}</div>
              <div className="text-xs text-ink-secondary mt-2">avg {inr(data.total_invoices ? data.total_revenue / data.total_invoices : 0)} per bill</div>
            </div>
            <div className="card-luxe">
              <div className="label-luxe">Payment Mix</div>
              <div className="font-playfair text-4xl mt-2">{data.by_payment_mode.length}</div>
              <div className="text-xs text-ink-secondary mt-2">payment modes used</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="card-luxe">
              <div className="label-luxe">Revenue by Payment Mode</div>
              <div className="font-playfair text-xl mt-1 mb-3">Breakdown</div>
              {data.by_payment_mode.length === 0 ? <div className="text-ink-secondary text-sm py-8 text-center">No data</div> : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.by_payment_mode} dataKey="amount" nameKey="mode" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {data.by_payment_mode.map((entry, i) => <Cell key={entry.mode} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#121212', border: '1px solid #ffffff20' }} formatter={(v) => inr(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card-luxe lg:col-span-2 p-0 overflow-hidden">
              <div className="p-4 flex items-center gap-2 border-b border-white/5">
                <FileText className="w-4 h-4 text-gold" />
                <h3 className="font-playfair text-xl">Recent Invoices</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="luxe-table">
                  <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Mode</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {data.invoices.slice(0, 20).map(i => (
                      <tr key={i.id}>
                        <td className="font-mono text-xs">{i.invoice_no}</td>
                        <td className="text-xs text-ink-secondary">{new Date(i.created_at).toLocaleDateString()}</td>
                        <td>{i.customer_name}</td>
                        <td><span className="text-[10px] uppercase tracking-wider text-gold">{i.payment_mode}</span></td>
                        <td className="text-right text-gold">{inr(i.total)}</td>
                      </tr>
                    ))}
                    {data.invoices.length === 0 && <tr><td colSpan="5" className="text-center py-8 text-ink-secondary">No invoices in range</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

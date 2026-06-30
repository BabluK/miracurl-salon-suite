import { useEffect, useState } from "react";
import api from "@/lib/api";
import { TrendingUp, Users, IndianRupee, Calendar, Package, Star, AlertTriangle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";

function Stat({ icon: Icon, label, value, hint, testid, accent }) {
  return (
    <div className="card-luxe group hover:border-gold/30 transition-all" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="label-luxe">{label}</div>
          <div className="font-playfair text-3xl mt-2">{value}</div>
          {hint && <div className="text-xs text-ink-secondary mt-1">{hint}</div>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent || 'bg-gold/10'} group-hover:scale-110 transition-transform`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-white' : 'text-gold'}`} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/reports/dashboard").then(r => setData(r.data)); }, []);

  if (!data) return <div className="text-ink-secondary">Loading dashboard...</div>;

  const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      {/* Hero strip */}
      <div className="card-luxe relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <img src="https://images.unsplash.com/photo-1759134198561-e2041049419c?w=1600" className="w-full h-full object-cover" alt="" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg-surface via-bg-surface/80 to-transparent" />
        </div>
        <div className="relative z-10">
          <div className="label-luxe text-gold">Today&apos;s Snapshot</div>
          <h1 className="font-playfair text-4xl mt-2">Good day at Miracurl ✦</h1>
          <p className="text-ink-secondary mt-2 max-w-lg">A polished glance at appointments, revenue and inventory — everything you need at a glance.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Stat icon={IndianRupee} label="Today Revenue" value={inr(data.today_revenue)} hint={`${data.today_invoices} invoices`} testid="kpi-revenue-today" />
        <Stat icon={Calendar} label="Today Bookings" value={data.today_bookings} hint="appointments scheduled" testid="kpi-bookings-today" />
        <Stat icon={TrendingUp} label="This Month" value={inr(data.month_revenue)} hint="month-to-date revenue" testid="kpi-revenue-month" />
        <Stat icon={Users} label="Total Customers" value={data.total_customers} hint={`${data.active_staff} active staff`} testid="kpi-customers" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card-luxe lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label-luxe">Revenue · Last 7 Days</div>
              <div className="font-playfair text-2xl mt-1">Trend Line</div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="date" stroke="#71717A" fontSize={11} tickFormatter={d => d.slice(5)} />
                <YAxis stroke="#71717A" fontSize={11} />
                <Tooltip contentStyle={{ background: '#121212', border: '1px solid #ffffff20', borderRadius: 8 }} labelStyle={{ color: '#D4AF37' }} />
                <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2.5} dot={{ fill: '#D4AF37', r: 4 }} activeDot={{ r: 6, fill: '#F0C847' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-luxe">
          <div className="label-luxe">Top Services</div>
          <div className="font-playfair text-2xl mt-1 mb-4">Most Booked</div>
          {data.top_services.length === 0 ? (
            <div className="text-ink-secondary text-sm py-8 text-center">No bookings yet</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.top_services} layout="vertical">
                  <XAxis type="number" stroke="#71717A" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#71717A" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: '#121212', border: '1px solid #ffffff20' }} />
                  <Bar dataKey="count" fill="#D4AF37" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Two columns: upcoming + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card-luxe">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label-luxe">Upcoming Today</div>
              <div className="font-playfair text-2xl mt-1">Appointments</div>
            </div>
            <Star className="w-5 h-5 text-gold" />
          </div>
          {data.upcoming_appointments.length === 0 ? (
            <div className="text-ink-secondary text-sm py-6 text-center">No appointments today</div>
          ) : (
            <ul className="space-y-3">
              {data.upcoming_appointments.map(a => (
                <li key={a.id} className="flex items-center justify-between p-3 rounded-md hover:bg-white/5 transition">
                  <div>
                    <div className="font-medium">{a.customer_name}</div>
                    <div className="text-xs text-ink-secondary">{a.service_names.join(", ")} • with {a.staff_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gold text-sm">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted">{a.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-luxe">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label-luxe">Stock Alerts</div>
              <div className="font-playfair text-2xl mt-1">{data.low_stock_count} Low</div>
            </div>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          {data.low_stock_items.length === 0 ? (
            <div className="text-ink-secondary text-sm py-6 text-center">All stocked up ✓</div>
          ) : (
            <ul className="space-y-3">
              {data.low_stock_items.map(p => (
                <li key={p.id} className="flex items-center justify-between p-3 rounded-md bg-amber-500/5 border border-amber-500/10">
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-ink-secondary">{p.brand} • SKU {p.sku}</div>
                    </div>
                  </div>
                  <div className="text-amber-400 font-mono text-sm">{p.stock} left</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

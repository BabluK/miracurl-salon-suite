import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TrendingUp, Users, IndianRupee, Calendar, Package, Star, AlertTriangle, Link as LinkIcon, Copy, ExternalLink, MessageSquare, Send } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { toast } from "sonner";
import ReviewBlastModal from "./ReviewBlastModal";

// Stable module-level constants so Recharts doesn't get new object refs every render.
const CHART_TOOLTIP_STYLE = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a' };
const CHART_TOOLTIP_LABEL_STYLE = { color: '#0284c7' };
const CHART_TOOLTIP_STYLE_BARE = { background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a' };
const LINE_DOT = { fill: '#0ea5e9', r: 4 };
const LINE_ACTIVE_DOT = { r: 6, fill: '#0284c7' };
const BAR_RADIUS = [0, 6, 6, 0];
const STAR_COUNT = [1, 2, 3, 4, 5];

const STAT_ACCENTS = {
  sky: { tile: "bg-sky-100", icon: "text-sky-600" },
  rose: { tile: "bg-rose-100", icon: "text-rose-600" },
  amber: { tile: "bg-amber-100", icon: "text-amber-600" },
  emerald: { tile: "bg-emerald-100", icon: "text-emerald-600" },
};

function Stat({ icon: Icon, label, value, hint, testid, color = "sky" }) {
  const accent = STAT_ACCENTS[color] || STAT_ACCENTS.sky;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">{label}</div>
          <div className="text-3xl font-semibold text-slate-800 mt-2">{value}</div>
          {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent.tile}`}>
          <Icon className={`w-5 h-5 ${accent.icon}`} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [blastOpen, setBlastOpen] = useState(false);
  const { tenant } = useAuth();

  useEffect(() => {
    api.get("/reports/dashboard")
      .then(r => setData(r.data))
      .catch(e => toast.error(`Couldn't load dashboard: ${e?.message || "network error"}`));
  }, []);

  if (!data) return <div className="text-slate-500 p-4">Loading dashboard…</div>;

  const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const slug = tenant?.slug || "miracurl-marathahalli";
  const bookingUrl = `${window.location.origin}/book/${slug}`;

  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(bookingUrl);
        toast.success("Booking link copied!");
        return;
      }
      throw new Error("clipboard unavailable");
    } catch {
      const el = document.getElementById("booking-link-input");
      if (el) { el.focus(); el.select(); toast.success("Selected — press Ctrl/Cmd + C to copy"); }
      else toast.error("Couldn't copy. Select the link manually.");
    }
  };

  return (
    <div className="bg-slate-50 -mx-6 -my-6 px-6 py-6 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6" data-testid="dashboard-page">

      {/* Hero strip with booking link */}
      <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute -right-20 -bottom-20 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 top-10 w-40 h-40 rounded-full bg-rose-400/30 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/80 font-medium">Today&apos;s Snapshot</div>
            <h1 className="text-3xl sm:text-4xl font-semibold mt-2 tracking-tight">Welcome back to Miracurl ✦</h1>
            <p className="text-white/85 mt-2 max-w-lg text-sm">A polished glance at appointments, revenue and inventory — everything you need at a glance.</p>
          </div>
          <div className="bg-white/15 backdrop-blur-md border border-white/30 rounded-xl p-4 max-w-md w-full" data-testid="booking-link-widget">
            <div className="flex items-center gap-2 mb-2">
              <LinkIcon className="w-4 h-4" />
              <span className="text-xs uppercase tracking-[0.2em] font-medium">Public Booking Link</span>
            </div>
            <p className="text-xs text-white/85 mb-3">Share on Instagram, WhatsApp & Google profile — customers can self-book 24/7.</p>
            <div className="flex items-center gap-2 bg-white/95 rounded-lg px-3 py-2 mb-3">
              <input
                id="booking-link-input"
                data-testid="booking-link-url"
                readOnly
                value={bookingUrl}
                onFocus={(e) => e.target.select()}
                className="text-xs text-slate-800 font-mono truncate flex-1 bg-transparent outline-none border-0 p-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <button data-testid="copy-booking-link-btn" onClick={copyLink} className="flex-1 px-3 py-1.5 rounded-md bg-white text-sky-700 text-xs font-semibold hover:bg-slate-100 transition flex items-center justify-center gap-1">
                <Copy className="w-3 h-3" /> Copy Link
              </button>
              <a data-testid="open-booking-link-btn" href={bookingUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-md bg-slate-900/30 hover:bg-slate-900/40 text-white text-xs font-semibold transition flex items-center justify-center gap-1">
                <ExternalLink className="w-3 h-3" /> Open
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={IndianRupee} label="Today Revenue" value={inr(data.today_revenue)} hint={`${data.today_invoices} invoices`} testid="kpi-revenue-today" color="emerald" />
        <Stat icon={Calendar} label="Today Bookings" value={data.today_bookings} hint="appointments scheduled" testid="kpi-bookings-today" color="sky" />
        <Stat icon={TrendingUp} label="This Month" value={inr(data.month_revenue)} hint="month-to-date revenue" testid="kpi-revenue-month" color="amber" />
        <Stat icon={Users} label="Total Customers" value={data.total_customers} hint={`${data.active_staff} active staff`} testid="kpi-customers" color="rose" />
      </div>

      {/* Rating + Pending review widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" data-testid="rating-widget">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Customer Rating</div>
          <div className="flex items-end gap-4 mt-3">
            <span className="text-5xl font-semibold text-amber-500" data-testid="dash-avg-rating">{(data.avg_rating || 0).toFixed(1)}</span>
            <div className="pb-2">
              <div className="flex items-center gap-0.5">
                {STAR_COUNT.map(n => (
                  <Star key={n} className={`w-4 h-4 ${n <= Math.round(data.avg_rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                ))}
              </div>
              <div className="text-xs text-slate-500 mt-1">{data.review_count || 0} reviews</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" data-testid="pending-reviews-widget">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-sky-600" />
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Pending Review Requests</div>
          </div>
          <div className="text-4xl font-semibold text-slate-800 mt-2">{data.pending_reviews || 0}</div>
          <p className="text-xs text-slate-500 mt-2">Completed visits that haven&apos;t received a review yet.</p>
          <button
            data-testid="open-review-blast-btn"
            onClick={() => setBlastOpen(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold hover:from-sky-600 hover:to-blue-600 shadow-sm transition"
          >
            <Send className="w-3.5 h-3.5" /> Send review-request blast
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Revenue · Last 7 Days</div>
              <div className="text-xl font-semibold text-slate-800 mt-1">Trend Line</div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={d => d.slice(5)} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Line type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2.5} dot={LINE_DOT} activeDot={LINE_ACTIVE_DOT} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Top Services</div>
          <div className="text-xl font-semibold text-slate-800 mt-1 mb-4">Most Booked</div>
          {data.top_services.length === 0 ? (
            <div className="text-slate-400 text-sm py-8 text-center">No bookings yet</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.top_services} layout="vertical">
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={90} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE_BARE} />
                  <Bar dataKey="count" fill="#0ea5e9" radius={BAR_RADIUS} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Two columns: upcoming + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Upcoming Today</div>
              <div className="text-xl font-semibold text-slate-800 mt-1">Appointments</div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
            </div>
          </div>
          {data.upcoming_appointments.length === 0 ? (
            <div className="text-slate-400 text-sm py-6 text-center">No appointments today</div>
          ) : (
            <ul className="space-y-2">
              {data.upcoming_appointments.map(a => (
                <li key={a.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition">
                  <div>
                    <div className="font-medium text-slate-800 text-sm">{a.customer_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{a.service_names.join(", ")} · with {a.staff_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sky-600 text-sm font-semibold">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">{a.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Stock Alerts</div>
              <div className="text-xl font-semibold text-slate-800 mt-1">{data.low_stock_count} Low</div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          {data.low_stock_items.length === 0 ? (
            <div className="text-emerald-600 text-sm py-6 text-center font-medium">All stocked up ✓</div>
          ) : (
            <ul className="space-y-2">
              {data.low_stock_items.map(p => (
                <li key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-amber-500" />
                    <div>
                      <div className="font-medium text-slate-800 text-sm">{p.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{p.brand} · SKU {p.sku}</div>
                    </div>
                  </div>
                  <div className="text-amber-600 font-mono text-sm font-semibold">{p.stock} left</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {blastOpen && <ReviewBlastModal onClose={() => setBlastOpen(false)} />}
    </div>
  );
}

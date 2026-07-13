import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TrendingUp, Users, IndianRupee, Calendar, Package, Star, AlertTriangle, Link as LinkIcon, Copy, ExternalLink, MessageSquare, Send, Bell, Check, Clock, ArrowRight } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { toast } from "sonner";
import ReviewBlastModal from "./ReviewBlastModal";
import DailyReportBanner from "@/components/DailyReportBanner";
import { CelebrationsCard } from "@/components/CelebrationsCard";
import { MorningBriefing } from "@/components/MorningBriefing";
import { getSelectedBranch } from "@/lib/branch";
import { WhatsAppApprovals } from "@/components/WhatsAppApprovals";
import { BranchSwitchApprovals } from "@/components/BranchSwitchApprovals";
import { QuickMusicBar } from "@/components/QuickMusicBar";
import { LogoStudio } from "@/components/LogoStudio";
import MySalonsOverview from "@/components/MySalonsOverview";
import { DashboardAurora } from "@/components/DashboardAurora";
import { MiraDayOffer } from "@/components/MiraDayOffer";
import { WinbackNudges } from "@/components/WinbackNudges";

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
  const [reminders, setReminders] = useState({ count: 0, items: [] });
  const [subStatus, setSubStatus] = useState(null);
  const { tenant, user } = useAuth();
  const isOwner = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    const fetchDash = () => {
      const b = getSelectedBranch();
      api.get("/reports/dashboard", { params: b ? { branch: b } : {} })
        .then(r => setData(r.data))
        .catch(e => toast.error(`Couldn't load dashboard: ${e?.message || "network error"}`));
    };
    fetchDash();
    window.addEventListener("branch-changed", fetchDash);
    if (isOwner) {
      api.get("/dashboard/reminders").then(r => setReminders(r.data)).catch(() => {});
      api.get("/billing/subscription-status").then(r => setSubStatus(r.data)).catch(() => {});
    }
    return () => window.removeEventListener("branch-changed", fetchDash);
  }, [isOwner]);

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
    <div className="app-canvas relative isolate overflow-hidden -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6" data-testid="dashboard-page">
      <DashboardAurora />
      <RenewalBanner sub={subStatus} />
      {isOwner && <MySalonsOverview />}
      {isOwner && <MorningBriefing />}
      {isOwner && <MiraDayOffer />}
      <CelebrationsCard />
      {isOwner && <WinbackNudges />}
      {isOwner && <DailyReportBanner ownerName={user?.name} />}
      {isOwner && <WhatsAppApprovals />}
      {isOwner && <BranchSwitchApprovals />}
      <QuickMusicBar />
      {isOwner && <LogoStudio />}

      {/* Hero strip with booking link */}
      <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute -right-20 -bottom-20 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 top-10 w-40 h-40 rounded-full bg-rose-400/30 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/80 font-medium">Today&apos;s Snapshot</div>
            <h1 className="text-3xl sm:text-4xl font-semibold mt-2 tracking-tight" data-testid="dashboard-welcome-heading">Welcome back to {tenant?.name || "your salon"} ✦</h1>
            <div className="mt-3 inline-flex items-center gap-2 bg-white/15 backdrop-blur-md border border-white/30 rounded-full px-4 py-2" data-testid="hero-today-collection">
              <IndianRupee className="w-4 h-4 text-emerald-200" />
              <span className="text-sm font-semibold">Today&apos;s Collection: {inr(data.today_revenue)}</span>
              <span className="text-xs text-white/80">· {data.today_invoices} bill{data.today_invoices === 1 ? "" : "s"}</span>
            </div>
            <p className="text-white/85 mt-3 max-w-lg text-sm">A polished glance at appointments, revenue and inventory — everything you need at a glance.</p>
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

      {isOwner && <RemindersWidget reminders={reminders} setReminders={setReminders} salonName={tenant?.name} />}

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
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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

      {/* Staff performance */}
      <StaffPerformance inr={inr} />

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

function RemindersWidget({ reminders, setReminders, salonName }) {
  const pending = (reminders.items || []).filter(i => !i.reminded);
  if (pending.length === 0 && (reminders.count ?? 0) === 0) return null;

  const sendOne = async (r) => {
    const when = new Date(r.scheduled_at).toLocaleString("en-IN", {
      weekday: "short", hour: "2-digit", minute: "2-digit",
    });
    const services = (r.service_names || []).join(", ") || "your visit";
    const text = `Hi ${r.customer_name.split(" ")[0]} ✦ This is a friendly reminder from ${salonName || "your salon"} — your appointment for *${services}*${r.staff_name ? ` with ${r.staff_name}` : ""} is at *${when}*. Reply here if you need to reschedule. See you soon! 💇`;
    const cleanPhone = String(r.customer_phone).replace(/\D/g, "");
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    // Optimistically mark as sent locally + persist
    setReminders(prev => ({
      ...prev,
      items: prev.items.map(i => i.appointment_id === r.appointment_id ? { ...i, reminded: true } : i),
    }));
    try { await api.post(`/dashboard/reminders/${r.appointment_id}/mark-sent`); }
    catch (e) { toast.error("Couldn't update reminder status"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" data-testid="reminders-widget">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Tomorrow&apos;s appointments</div>
            <div className="text-lg font-semibold text-slate-800">Send WhatsApp reminders</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold text-slate-800">{pending.length}</div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider">to remind</div>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">A one-tap personalised WhatsApp nudge reduces no-shows by ~30%. Tap Send next to each guest.</p>
      {pending.length === 0 ? (
        <div className="text-emerald-600 text-sm flex items-center gap-2 py-3" data-testid="reminders-empty">
          <Check className="w-4 h-4" /> All sent for the next 24 hours.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {pending.map(r => {
            const when = new Date(r.scheduled_at).toLocaleString("en-IN", {
              weekday: "short", hour: "2-digit", minute: "2-digit",
            });
            return (
              <li key={r.appointment_id} className="py-3 flex items-center gap-3" data-testid={`reminder-row-${r.appointment_id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 truncate">{r.customer_name} <span className="text-slate-400">·</span> <span className="font-mono text-xs text-slate-500">{r.customer_phone}</span></div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3 h-3" /> {when}
                    {r.staff_name && <> <span className="text-slate-300">·</span> with {r.staff_name}</>}
                  </div>
                </div>
                <button
                  onClick={() => sendOne(r)}
                  data-testid={`reminder-send-${r.appointment_id}`}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold"
                >
                  <Send className="w-3.5 h-3.5" /> WhatsApp
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


function RenewalBanner({ sub }) {
  if (!sub || !sub.needs_renewal_prompt) return null;
  const days = sub.days_remaining;
  const overdue = days < 0;
  const urgent = days <= 3;
  const label = sub.source === "trial" ? "Free trial" : "Subscription";
  const message = (() => {
    if (overdue) return `${label} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
    if (days === 0) return `${label} ends today`;
    return `${label} ends in ${days} day${days === 1 ? "" : "s"}`;
  })();
  const tone = overdue || urgent
    ? "from-rose-500 to-red-600"
    : "from-amber-400 to-orange-500";
  return (
    <div
      className={`relative rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm bg-gradient-to-r ${tone}`}
      data-testid="renewal-banner"
    >
      <div className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm sm:text-base font-semibold">
          {message}
        </div>
        <div className="text-xs sm:text-sm text-white/85 mt-0.5">
          {overdue
            ? "Renew now to keep your bookings, invoices and customer data active."
            : "Renew now — pay via card, UPI or NetBanking through Razorpay."}
          {sub.affiliate_credits > 0 && (
            <> · <b>₹{Number(sub.affiliate_credits).toLocaleString("en-IN")}</b> credit will auto-apply.</>
          )}
        </div>
      </div>
      <a
        href="/settings#subscription"
        data-testid="renewal-banner-cta"
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-slate-800 font-semibold text-sm hover:bg-slate-100 transition shadow"
      >
        Renew now <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  );
}

const PERF_TABS = [
  { k: "today", label: "Today" },
  { k: "week", label: "This Week" },
  { k: "month", label: "This Month" },
  { k: "last_month", label: "Last Month" },
];

function StaffPerformance({ inr }) {
  const [perf, setPerf] = useState(null);
  const [tab, setTab] = useState("today");

  useEffect(() => {
    api.get("/reports/staff-performance").then(r => setPerf(r.data)).catch(() => setPerf({}));
  }, []);

  const rows = perf?.[tab] || [];
  const maxRev = rows[0]?.revenue || 1;
  const range = perf?.ranges?.[tab];
  const fmtD = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  const rangeLabel = range ? (range.start === range.end ? fmtD(range.start) : `${fmtD(range.start)} – ${fmtD(range.end)}`) : "";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" data-testid="staff-performance-card">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Staff Performance</div>
          <div className="text-xl font-semibold text-slate-800 mt-1">Business by Stylist</div>
          {rangeLabel && (
            <div className="text-[11px] text-slate-400 mt-0.5" data-testid="perf-range-label">
              {rangeLabel}
              {tab === "week" && perf?.ranges?.week?.start?.slice(0, 7) !== perf?.ranges?.month?.start?.slice(0, 7) && (
                <span className="text-amber-500 font-medium"> · includes end of last month</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          {PERF_TABS.map(t => (
            <button key={t.k} data-testid={`perf-tab-${t.k}`} onClick={() => setTab(t.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                tab === t.k ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {!perf ? (
        <div className="text-slate-400 text-sm py-6 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-400 text-sm py-6 text-center">No billing recorded for this period yet.</div>
      ) : (
        <ul className="space-y-2" data-testid="perf-rows">
          {rows.map((r, i) => (
            <li key={r.staff_id} data-testid={`perf-row-${r.staff_id}`} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                {i === 0 ? "🏆" : `#${i + 1}`}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 text-sm truncate">{r.name}</span>
                  <span className="font-bold text-slate-900 text-sm">{inr(r.revenue)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] text-slate-400">{r.bills} bill{r.bills !== 1 ? "s" : ""} · {r.services} service{r.services !== 1 ? "s" : ""}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${i === 0 ? "bg-amber-400" : "bg-sky-400"}`}
                    style={{ width: `${Math.max(4, (r.revenue / maxRev) * 100)}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


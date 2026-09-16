import { useEffect, useState } from "react";
import { BrandSplash } from "@/components/BrandSplash";
import api from "@/lib/api";
import pinApi from "@/lib/ownerPin";
import { useAuth } from "@/context/AuthContext";
import { TrendingUp, Users, IndianRupee, Calendar, Package, Star, AlertTriangle, Link as LinkIcon, Copy, ExternalLink, MessageSquare, Send, Bell, Check, Clock, ArrowRight, Lock, Unlock, Eye, EyeOff } from "lucide-react";
import { ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, ReferenceDot } from "recharts";
import { toast } from "sonner";
import ReviewBlastModal from "./ReviewBlastModal";
import DailyReportBanner from "@/components/DailyReportBanner";
import { CelebrationsCard } from "@/components/CelebrationsCard";
import { MorningBriefing } from "@/components/MorningBriefing";
import { MiracurlUpdates } from "@/components/MiracurlUpdates";
import { getSelectedBranch } from "@/lib/branch";
import { WhatsAppApprovals } from "@/components/WhatsAppApprovals";
import { BranchSwitchApprovals } from "@/components/BranchSwitchApprovals";
import { QuickMusicBar } from "@/components/QuickMusicBar";
import { LogoStudio } from "@/components/LogoStudio";
import MySalonsOverview from "@/components/MySalonsOverview";
import { DashboardAurora } from "@/components/DashboardAurora";
import { MiraDayOffer } from "@/components/MiraDayOffer";
import { CircleBonusCard } from "@/components/CircleBonusCard";
import { WinbackNudges } from "@/components/WinbackNudges";
import { WeeklyDigestCard } from "@/components/WeeklyDigestCard";
import { MiraSocialNudge } from "@/components/MiraSocialNudge";
import { SetupBanner } from "@/components/SetupBanner";
import { SmsPointsWidget } from "@/components/dashboard/SmsPointsWidget";
import { WaCreditsBanner } from "@/components/dashboard/WaCreditsBanner";
import { WelcomeCongratsModal } from "@/components/WelcomeCongratsModal";
import { TrialCountdownRing } from "@/components/dashboard/TrialCountdownRing";
import { PendingApprovalsTile } from "@/components/dashboard/MiraBlast";
import { DashboardHero, MiraAssistantCard, LowStockCard, MiraSuggestsCard, QuickActionsCard, MembershipPromoCard } from "@/components/dashboard/HeroBlocks";

// Stable module-level constants so Recharts doesn't get new object refs every render.
const CHART_TOOLTIP_STYLE = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a' };
const CHART_TOOLTIP_LABEL_STYLE = { color: '#0284c7' };
const CHART_TOOLTIP_STYLE_BARE = { background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a' };
const LINE_DOT = { fill: '#0ea5e9', r: 4 };
const LINE_ACTIVE_DOT = { r: 6, fill: '#0284c7' };
const BAR_RADIUS = [0, 6, 6, 0];
const STAR_COUNT = [1, 2, 3, 4, 5];

const STAT_ACCENTS = {
  sky: { tile: "bg-sky-50 ring-sky-100", icon: "text-sky-500", pill: "bg-sky-50 text-sky-700", line: "#38bdf8" },
  rose: { tile: "bg-rose-50 ring-rose-100", icon: "text-rose-500", pill: "bg-rose-50 text-rose-700", line: "#f472b6" },
  amber: { tile: "bg-amber-50 ring-amber-100", icon: "text-amber-600", pill: "bg-amber-50 text-amber-700", line: "#c89b52" },
  emerald: { tile: "bg-emerald-50 ring-emerald-100", icon: "text-emerald-600", pill: "bg-emerald-50 text-emerald-700", line: "#34d399" },
};
const SPARK_D = "M0,30 C10,28 14,18 22,20 S34,30 42,22 S54,8 62,12 S74,26 82,16 S94,2 100,4";

function DeltaPill({ now, prev, vs, cls }) {
  if (prev == null) return null;
  const pct = prev > 0 ? Math.round(((now - prev) / prev) * 100) : (now > 0 ? 100 : 0);
  const up = pct >= 0;
  return (
    <div className={`text-right px-2.5 py-1.5 rounded-xl ${cls}`} data-testid="kpi-delta">
      <div className={`text-xs font-bold leading-none ${up ? "" : "text-rose-600"}`}>{up ? "↗" : "↘"} {Math.abs(pct)}%</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{vs}</div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, testid, color = "sky", action, now, prev, vs }) {
  const accent = STAT_ACCENTS[color] || STAT_ACCENTS.sky;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#eadfcb] p-5 shadow-sm hover:shadow-md transition-shadow bg-[linear-gradient(135deg,#fffdf8_0%,#fbf6ec_100%)]" data-testid={testid}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="pointer-events-none absolute right-0 bottom-0 w-[55%] h-14 opacity-70" aria-hidden="true">
        <defs><linearGradient id={`sp-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent.line} stopOpacity="0.35" /><stop offset="100%" stopColor={accent.line} stopOpacity="0" /></linearGradient></defs>
        <path d={`${SPARK_D} L100,32 L0,32 Z`} fill={`url(#sp-${color})`} /><path d={SPARK_D} fill="none" stroke={accent.line} strokeWidth="1.6" />
      </svg>
      <div className="relative flex items-start gap-4">
        <div className={`w-14 h-14 rounded-full ring-1 flex items-center justify-center flex-shrink-0 ${accent.tile}`}><Icon className={`w-6 h-6 ${accent.icon}`} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[#6b5a3e] font-semibold flex items-center gap-2 pt-1">{label}{action}</div>
            <DeltaPill now={now} prev={prev} vs={vs} cls={accent.pill} />
          </div>
          <div className="font-playfair text-3xl sm:text-[34px] text-slate-900 mt-1 leading-tight">{value}</div>
          {hint && <div className="text-sm text-slate-500 mt-1">{hint}</div>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [showMonth, setShowMonth] = useState(false);
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

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const monthMasked = !!data && (data.month_revenue_locked || (data.month_revenue_hidden_for_staff && !showMonth));
  useEffect(() => { if (!showMonth) return; const id = setTimeout(() => setShowMonth(false), 15000); return () => clearTimeout(id); }, [showMonth]);
  async function toggleRevenueLock() {
    const hide = !data.month_revenue_hidden_for_staff;
    try {
      await pinApi.put("/settings/revenue-lock", { hide });
      setData(d => ({ ...d, month_revenue_hidden_for_staff: hide }));
      toast.success(hide ? "Month revenue is now hidden from managers & staff" : "Month revenue is visible to your team again");
    } catch (e) { if (e?.response) toast.error(e.response?.data?.detail || "Couldn't update"); }
  }
  if (!data) return <BrandSplash fullscreen />;

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
      <DashboardHero user={user} tenant={tenant} data={data} bookingUrl={bookingUrl} onCopy={copyLink} inr={inr} />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={IndianRupee} label="Today Revenue" value={inr(data.today_revenue)} hint={`${data.today_invoices} invoices`} testid="kpi-revenue-today" color="emerald" now={data.today_revenue} prev={data.compare?.yesterday_revenue} vs="vs yesterday" />
        <Stat icon={Calendar} label="Today Bookings" value={data.today_bookings} hint="appointments scheduled" testid="kpi-bookings-today" color="sky" now={data.today_bookings} prev={data.compare?.yesterday_bookings} vs="vs yesterday" />
        <Stat icon={TrendingUp} label="This Month" color="amber" testid="kpi-revenue-month" now={monthMasked ? null : data.month_revenue} prev={monthMasked ? null : data.compare?.last_month_revenue} vs="vs last month"
          value={monthMasked
            ? <span className="inline-flex items-center gap-2"><span className="tracking-widest text-slate-400" data-testid="month-revenue-masked">••••••</span>
                {isAdmin && <button type="button" data-testid="month-revenue-reveal-btn" onClick={() => setShowMonth(true)} title="Reveal for a moment" className="w-7 h-7 rounded-full bg-amber-50 border border-amber-200 text-amber-700 inline-flex items-center justify-center hover:bg-amber-100"><Eye className="w-3.5 h-3.5" /></button>}</span>
            : <span className="inline-flex items-center gap-2">{inr(data.month_revenue)}
                {isAdmin && data.month_revenue_hidden_for_staff && <button type="button" data-testid="month-revenue-hide-btn" onClick={() => setShowMonth(false)} title="Hide again" className="w-7 h-7 rounded-full bg-amber-50 border border-amber-200 text-amber-700 inline-flex items-center justify-center hover:bg-amber-100"><EyeOff className="w-3.5 h-3.5" /></button>}</span>}
          hint={data.month_revenue_locked ? "Locked by owner" : (data.month_revenue_hidden_for_staff ? (monthMasked ? "hidden · tap the eye to peek" : "visible for 15s · hides again automatically") : "month-to-date revenue")}
          action={isAdmin && (
            <button onClick={toggleRevenueLock} data-testid="month-revenue-lock-btn"
              title={data.month_revenue_hidden_for_staff ? "Hidden from managers/staff — tap to show them (owner PIN)" : "Visible to managers/staff — tap to hide (owner PIN)"}
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition ${data.month_revenue_hidden_for_staff ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-400 hover:text-slate-700"}`}>
              {data.month_revenue_hidden_for_staff ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
          )} />
        <Stat icon={Users} label="Total Customers" value={data.total_customers} hint={`${data.active_staff} active staff`} testid="kpi-customers" color="rose" now={data.total_customers} prev={data.compare?.customers_last_month} vs="vs last month" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4" data-testid="dashboard-mira-row">
        <MiraAssistantCard inactive={data.inactive_customers_30d} />
        <div className="space-y-4">
          <LowStockCard items={data.low_stock_items || []} count={data.low_stock_count || 0} />
          <MiraSuggestsCard />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.1fr] gap-4" data-testid="dashboard-actions-row">
        <PendingApprovalsTile />
        <QuickActionsCard />
        <MembershipPromoCard />
      </div>

      {isOwner && <WelcomeCongratsModal />}
      <RenewalBanner sub={subStatus} />
      {isOwner && <TrialCountdownRing />}
      <ReferralNudgeBanner />
      {isOwner && <MySalonsOverview />}
      {(isOwner || user?.role === "manager") && <MorningBriefing />}
      {isOwner && <MiracurlUpdates />}
      {isOwner && <SetupBanner />}
      {isOwner && <WaCreditsBanner />}
      {isOwner && <SmsPointsWidget />}
      {isOwner && <MiraSocialNudge />}
      {isOwner && <MiraDayOffer />}
      {isOwner && <CircleBonusCard slug={tenant?.slug || "miracurl-marathahalli"} />}
      <CelebrationsCard />
      {isOwner && <WinbackNudges />}
      {isOwner && <WeeklyDigestCard />}
      {isOwner && <DailyReportBanner ownerName={user?.name} />}
      {isOwner && <WhatsAppApprovals />}
      {isOwner && <BranchSwitchApprovals />}
      <QuickMusicBar />
      {isOwner && <LogoStudio />}

      {/* Rating + Pending review widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={GOLD_CARD} data-testid="rating-widget">
          <div className="pointer-events-none absolute -bottom-10 -left-6 w-56 h-56 rounded-full bg-[#d4af37]/10 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/70 border border-[#eadfcb] flex items-center justify-center shadow-sm"><Star className="w-5 h-5 fill-[#d4af37] text-[#b08d3f]" /></div>
            <div><div className="text-[11px] uppercase tracking-[0.26em] text-[#6b5a3e] font-semibold">Customer Rating</div><div className="text-sm text-slate-600">Your clients love us!</div></div>
          </div>
          <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-center gap-5">
            <div>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-playfair text-6xl sm:text-7xl leading-none bg-gradient-to-b from-[#8a6a1f] to-[#4a3608] bg-clip-text text-transparent" data-testid="dash-avg-rating">{(data.avg_rating || 0).toFixed(1)}</span>
                <div>
                  <div className="flex items-center gap-1">{STAR_COUNT.map(n => <Star key={n} className={`w-6 h-6 ${n <= Math.round(data.avg_rating || 0) ? "fill-[#e5b93c] text-[#d4a12f]" : "fill-slate-200 text-slate-200"}`} />)}</div>
                  <div className="text-sm text-slate-500 mt-1.5 ml-1">{data.review_count || 0} reviews</div>
                </div>
              </div>
              <div className="mt-5 pt-4 border-t border-[#e3d5bd]" data-testid="rating-quote">
                <div className="flex gap-3"><span className="font-playfair text-4xl text-[#d6c7ab] leading-none">“</span>
                  <div><div className="font-playfair italic text-slate-800 text-base sm:text-lg">{data.latest_review?.text || "Great service, amazing experience!"}”</div>
                    <div className="text-xs text-slate-500 mt-1">– {data.latest_review?.name || "Happy Customer"}</div></div></div>
              </div>
            </div>
            <div className="hidden sm:block w-px h-40 bg-[#e3d5bd]" />
            <div className="hidden sm:flex items-center justify-center relative w-52 h-48">
              <svg viewBox="0 0 200 190" className="absolute inset-0 w-full h-full text-[#c89b52]" aria-hidden="true">
                <g fill="currentColor" opacity="0.85">
                  {Array.from({ length: 9 }).map((_, i) => { const a = (125 + i * 14) * Math.PI / 180; const r = 80; const cx = 100 + r * Math.cos(a), cy = 100 + r * Math.sin(a); const rot = (a * 180 / Math.PI) + 90; return (
                    <g key={`l${i}`}><ellipse cx={cx} cy={cy} rx="5" ry="12" transform={`rotate(${rot - 25} ${cx} ${cy})`} /><ellipse cx={cx} cy={cy} rx="5" ry="12" transform={`rotate(${rot + 25} ${cx} ${cy})`} opacity="0.7" /></g>); })}
                  {Array.from({ length: 9 }).map((_, i) => { const a = (55 - i * 14) * Math.PI / 180; const r = 80; const cx = 100 + r * Math.cos(a), cy = 100 + r * Math.sin(a); const rot = (a * 180 / Math.PI) + 90; return (
                    <g key={`r${i}`}><ellipse cx={cx} cy={cy} rx="5" ry="12" transform={`rotate(${rot + 25} ${cx} ${cy})`} /><ellipse cx={cx} cy={cy} rx="5" ry="12" transform={`rotate(${rot - 25} ${cx} ${cy})`} opacity="0.7" /></g>); })}
                </g>
                <path d="M100 178 c-3-6-14-10-14-19 a7 7 0 0 1 14-3 a7 7 0 0 1 14 3 c0 9-11 13-14 19z" fill="#b08d3f" />
              </svg>
              <div className="relative text-[11px] uppercase tracking-[0.22em] text-[#5e4a2a] font-semibold leading-[1.9] text-center -translate-y-2">Client<br />Happiness<br />Our Priority</div>
            </div>
          </div>
        </div>

        <div className={GOLD_CARD} data-testid="pending-reviews-widget">
          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
            <div>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shadow-sm"><MessageSquare className="w-5 h-5 text-rose-500" /></div>
                <div><div className="text-[11px] uppercase tracking-[0.26em] text-[#6b5a3e] font-semibold">Pending Review Requests</div><div className="text-sm text-slate-600">Turn happy customers into great reviews</div></div>
              </div>
              <div className="font-playfair text-6xl text-slate-900 mt-4 leading-none" data-testid="pending-reviews-count">{data.pending_reviews || 0}</div>
              <p className="text-sm text-slate-600 mt-2">Completed visits that haven&apos;t received a review yet.</p>
              <button data-testid="open-review-blast-btn" onClick={() => setBlastOpen(true)}
                className="mt-5 inline-flex items-center gap-3 pl-5 pr-6 py-3 rounded-2xl bg-gradient-to-r from-[#7f2d3f] via-[#9b3a4e] to-[#b34a5f] text-white font-playfair text-lg shadow-[0_12px_28px_-10px_rgba(155,58,78,.7)] hover:brightness-110 active:scale-[.98] transition-[filter,transform]">
                <Send className="w-4 h-4" /> Send review-request blast <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="hidden md:flex flex-col items-center justify-center pt-2 pr-2 w-44">
              <div className="relative w-36 h-28 rounded-3xl bg-gradient-to-br from-[#fde7ea] to-[#f9d5db] shadow-[0_18px_30px_-16px_rgba(155,58,78,.6)] rotate-[-4deg] flex flex-col items-center justify-center gap-2">
                <div className="flex gap-1">{STAR_COUNT.map(n => <Star key={n} className="w-5 h-5 fill-[#e5b93c] text-[#d4a12f] drop-shadow" />)}</div>
                <div className="w-20 h-1.5 rounded-full bg-rose-200" /><div className="w-14 h-1.5 rounded-full bg-rose-200" />
                <div className="absolute -bottom-3 left-8 w-6 h-6 bg-[#f9d5db] rotate-45 rounded-sm" />
              </div>
              <div className="mt-6 font-playfair italic text-[#9b3a4e] text-xl text-center leading-tight rotate-[-8deg]">More Reviews<br />More Smiles ♡</div>
            </div>
          </div>
        </div>
      </div>

      {isOwner && <RemindersWidget reminders={reminders} setReminders={setReminders} salonName={tenant?.name} />}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RevenueTrendCard trend={data.revenue_trend} inr={inr} />
        <TopServicesCard services={data.top_services} />
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
    const text =
      `✦ *${(salonName || "MIRACURL").toUpperCase()}* ✦\n\n` +
      `Hi ${r.customer_name.split(" ")[0]}! A gentle reminder — your appointment is *today* ✅\n\n` +
      `• Service: *${services}*\n` +
      `• Time: *${when}*\n` +
      (r.staff_name ? `• Stylist: ${r.staff_name}\n` : "") +
      `\nWe look forward to pampering you ✨\n` +
      `Need to change the time? Just reply to this message ✦`;
    let cleanPhone = String(r.customer_phone).replace(/\D/g, "");
    if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) cleanPhone = cleanPhone.slice(1);
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
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


function ReferralNudgeBanner() {
  const [nudge, setNudge] = useState(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem("referral_nudge_dismissed") === new Date().toISOString().slice(0, 10));
  useEffect(() => {
    api.get("/settings/referral-nudge").then(r => setNudge(r.data)).catch(() => {});
  }, []);
  if (hidden || !nudge || nudge.count === 0) return null;
  const first = nudge.pending[0]?.referred_salon_name || "A salon";
  const dismiss = () => {
    localStorage.setItem("referral_nudge_dismissed", new Date().toISOString().slice(0, 10));
    setHidden(true);
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-100 via-amber-50 to-white px-4 sm:px-5 py-3 shadow-sm" data-testid="referral-nudge-banner">
      <span className="text-2xl">🎁</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800">
          {nudge.count === 1
            ? <><b className="text-amber-700">{first}</b> signed up with your link — you're 1 payment away from a FREE MONTH!</>
            : <><b className="text-amber-700">{nudge.count} salons</b> signed up with your link — each first payment earns you a FREE MONTH!</>}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">The month is added to your subscription automatically the moment they pay.</div>
      </div>
      <a href="/refer" data-testid="referral-nudge-cta"
        className="shrink-0 hidden sm:inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition">
        View referrals
      </a>
      <button onClick={dismiss} data-testid="referral-nudge-dismiss" title="Hide for today"
        className="shrink-0 w-7 h-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center">✕</button>
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
  { k: "yesterday", label: "Yesterday" },
  { k: "week", label: "This Week" },
  { k: "month", label: "This Month" },
  { k: "last_month", label: "Last Month" },
];

const PERF_MEDALS = [
  { ring: "from-[#F3D27A] to-[#C89B52] text-[#5b4300] shadow-[0_6px_14px_-4px_rgba(200,155,82,.7)]", bar: "from-[#C89B52] via-[#E8C96A] to-[#F0D9A5]", tag: "Top Performer", sub: "Keep it up!", icon: "👑" },
  { ring: "from-slate-200 to-slate-400 text-slate-700", bar: "from-sky-400 to-sky-300", tag: "On Track", sub: "Great progress!", icon: "2" },
  { ring: "from-orange-200 to-orange-400 text-orange-900", bar: "from-orange-400 to-amber-300", tag: "Rising", sub: "Push a little more" , icon: "3" },
];
const PERF_AVATAR = ["bg-rose-100 text-rose-600", "bg-sky-100 text-sky-600", "bg-emerald-100 text-emerald-600", "bg-violet-100 text-violet-600", "bg-amber-100 text-amber-700"];

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
    <div className="relative overflow-hidden rounded-3xl border border-[#eadfcb] p-5 sm:p-6 shadow-sm bg-[radial-gradient(120%_100%_at_0%_0%,#fff8ec_0%,#f7efe2_55%,#f3e9d8_100%)]" data-testid="staff-performance-card">
      <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#d4af37]/10 blur-2xl" />
      <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/70 border border-[#eadfcb] items-center justify-center text-2xl shadow-sm">✂️</div>
          <div className="sm:border-l sm:border-[#e3d5bd] sm:pl-4">
            <div className="text-[11px] uppercase tracking-[0.26em] text-[#8a7350] font-semibold">Staff Performance</div>
            <div className="font-playfair text-2xl sm:text-3xl text-slate-900 leading-tight">Business by Stylist</div>
            {rangeLabel && (
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5" data-testid="perf-range-label">
                <Calendar className="w-3.5 h-3.5 text-[#b08d3f]" /> {rangeLabel}
                {tab === "week" && perf?.ranges?.week?.start?.slice(0, 7) !== perf?.ranges?.month?.start?.slice(0, 7) && (
                  <span className="text-amber-600 font-medium">· includes end of last month</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/80 border border-[#eadfcb] shadow-sm flex-wrap" data-testid="perf-tabs">
          <span className="hidden sm:inline-flex w-8 h-8 items-center justify-center text-[#b08d3f]"><Calendar className="w-4 h-4" /></span>
          {PERF_TABS.map(t => (
            <button key={t.k} data-testid={`perf-tab-${t.k}`} onClick={() => setTab(t.k)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-[background-color,color,transform] active:scale-95 ${
                tab === t.k ? "bg-gradient-to-r from-[#b8893a] to-[#d4af37] text-white shadow" : "text-slate-600 hover:bg-[#f3e9d8]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {!perf ? (
        <div className="text-slate-400 text-sm py-6 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center bg-white/60 rounded-2xl border border-dashed border-[#e3d5bd]">No billing recorded for this period yet.</div>
      ) : (
        <ul className="space-y-3" data-testid="perf-rows">
          {rows.map((r, i) => {
            const m = PERF_MEDALS[i] || { ring: "from-slate-100 to-slate-200 text-slate-500", bar: "from-slate-300 to-slate-200", tag: "In the game", sub: "Every bill counts", icon: `${i + 1}` };
            const pct = Math.max(4, (r.revenue / maxRev) * 100);
            return (
              <li key={r.staff_id} data-testid={`perf-row-${r.staff_id}`} style={{ animationDelay: `${i * 70}ms` }}
                className="animate-fade-up flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-white/85 border border-white shadow-[0_8px_24px_-14px_rgba(80,60,20,.35)]">
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${m.ring} flex items-center justify-center text-base font-bold flex-shrink-0 ring-2 ring-white`}>{m.icon}</div>
                <div className={`hidden sm:flex w-11 h-11 rounded-full items-center justify-center font-playfair text-lg font-semibold flex-shrink-0 ${PERF_AVATAR[i % PERF_AVATAR.length]}`}>{(r.name || "?").trim().charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-playfair text-lg text-slate-900 truncate leading-tight">{r.name}</div>
                      <div className="text-[11px] text-slate-500">{r.bills} bill{r.bills !== 1 ? "s" : ""} · {r.services} service{r.services !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="font-playfair text-xl text-slate-900 whitespace-nowrap">{inr(r.revenue)}</div>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-200/70 mt-2 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${m.bar} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="hidden lg:flex items-center gap-2.5 pl-4 border-l border-slate-200 min-w-[170px]">
                  <div className="w-9 h-9 rounded-xl bg-[#f7efe2] flex items-center justify-center text-base">{i === 0 ? "📈" : i === 1 ? "🎯" : "✨"}</div>
                  <div><div className="text-sm font-semibold text-slate-800">{m.tag}</div><div className="text-[11px] text-slate-500">{m.sub}</div></div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5 pt-4 border-t border-[#e3d5bd] flex items-center justify-between gap-3 text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-[#8a7350]">
        <span>Beauty people. Stronger together.</span>
        <span className="font-playfair normal-case tracking-[0.3em] text-sm text-slate-800">MIRACURL</span>
      </div>
    </div>
  );
}


const GOLD_CARD = "relative overflow-hidden rounded-3xl border border-[#eadfcb] p-5 sm:p-6 shadow-sm bg-[radial-gradient(120%_100%_at_0%_0%,#fff8ec_0%,#f7efe2_55%,#f3e9d8_100%)]";
const fmtDay = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const fmtDow = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });

function GoldStat({ icon, value, label }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-9 h-9 rounded-full bg-white/80 border border-[#eadfcb] flex items-center justify-center text-base shadow-sm flex-shrink-0">{icon}</div>
      <div className="min-w-0"><div className="font-playfair text-lg text-slate-900 leading-tight truncate">{value}</div><div className="text-[11px] text-slate-500 truncate">{label}</div></div>
    </div>
  );
}

function RevenueTrendCard({ trend = [], inr }) {
  const total = trend.reduce((a, d) => a + (d.revenue || 0), 0);
  const peak = trend.reduce((m, d) => (d.revenue > (m?.revenue ?? -1) ? d : m), null);
  const tracked = trend.filter(d => d.revenue > 0).length;
  const first = trend[0]?.date, last = trend[trend.length - 1]?.date;
  const XTick = ({ x, y, payload }) => (
    <g transform={`translate(${x},${y})`}><text textAnchor="middle" fill="#6b5a3e" fontSize={11} dy={12}>{fmtDay(payload.value)}</text><text textAnchor="middle" fill="#a08a66" fontSize={10} dy={26}>{fmtDow(payload.value)}</text></g>
  );
  return (
    <div className={`${GOLD_CARD} lg:col-span-2`} data-testid="revenue-trend-card">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/70 border border-[#eadfcb] items-center justify-center text-2xl shadow-sm">📈</div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-[#8a7350] font-semibold">Revenue · Last 7 Days</div>
            <div className="font-playfair text-2xl sm:text-3xl text-slate-900 leading-tight">Revenue Trend</div>
            <div className="text-xs text-slate-500 mt-0.5">Track your daily revenue and see your business growth</div>
          </div>
        </div>
        {first && <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/80 border border-[#eadfcb] text-xs font-medium text-slate-700 shadow-sm" data-testid="revenue-trend-range"><Calendar className="w-3.5 h-3.5 text-[#b08d3f]" /> {fmtDay(first)} – {fmtDay(last)} {last?.slice(0, 4)}</div>}
      </div>
      <div className="h-64 -ml-2">
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <AreaChart data={trend} margin={{ top: 28, right: 12, left: 0, bottom: 16 }}>
            <defs>
              <linearGradient id="goldArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c89b52" stopOpacity={0.45} /><stop offset="100%" stopColor="#c89b52" stopOpacity={0.02} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8dcc6" vertical={false} />
            <XAxis dataKey="date" stroke="#d6c7ab" tickLine={false} tick={<XTick />} height={40} interval={0} />
            <YAxis stroke="#d6c7ab" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#8a7350" }} tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : v}`} width={52} />
            <Tooltip cursor={{ stroke: "#c89b52", strokeDasharray: "3 3" }} contentStyle={{ background: "#fffaf0", border: "1px solid #eadfcb", borderRadius: 12, color: "#1e293b" }} labelStyle={{ color: "#8a7350" }} formatter={(v) => [inr(v), "Revenue"]} labelFormatter={(l) => `${fmtDay(l)} · ${fmtDow(l)}`} />
            <Area type="monotone" dataKey="revenue" stroke="#b08d3f" strokeWidth={2.5} fill="url(#goldArea)" dot={{ fill: "#b08d3f", stroke: "#fff8ec", strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: "#d4af37" }} />
            {peak?.revenue > 0 && <ReferenceDot x={peak.date} y={peak.revenue} r={0} shape={(p) => <g><rect x={p.cx - 58} y={p.cy - 40} width={116} height={24} rx={8} fill="#8a6d1f" /><text x={p.cx} y={p.cy - 24} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="600">{`${inr(peak.revenue)} · ${fmtDay(peak.date)}`}</text></g>} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 pt-4 border-t border-[#e3d5bd] grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="revenue-trend-stats">
        <GoldStat icon="🏦" value={inr(total)} label="Total Revenue" />
        <GoldStat icon="↗" value={inr(trend.length ? Math.round(total / trend.length) : 0)} label="Daily Average" />
        <GoldStat icon="⭐" value={inr(peak?.revenue || 0)} label={peak ? `Highest Day (${fmtDay(peak.date)})` : "Highest Day"} />
        <GoldStat icon="📅" value={tracked} label="Days with billing" />
      </div>
    </div>
  );
}

const SERVICE_ICON = [["colour", "🎨"], ["color", "🎨"], ["beard", "🧔"], ["men", "💇‍♂️"], ["women", "💇‍♀️"], ["facial", "🧖"], ["wash", "🚿"], ["spa", "🧖"], ["nail", "💅"], ["wax", "🪒"], ["threading", "🪡"], ["makeup", "💄"], ["massage", "💆"], ["keratin", "✨"], ["smooth", "✨"]];
const svcIcon = (n = "") => (SERVICE_ICON.find(([k]) => n.toLowerCase().includes(k)) || [null, "✂️"])[1];
const ROSE_BARS = ["from-[#8f4a5e] to-[#a85c73]", "from-[#b5657e] to-[#c9788f]", "from-[#d68ea2] to-[#e3a5b5]", "from-[#e3a5b5] to-[#eebcc8]", "from-[#eebcc8] to-[#f4d2da]"];

function TopServicesCard({ services = [] }) {
  const max = services[0]?.count || 1;
  return (
    <div className={GOLD_CARD} data-testid="top-services-card">
      <div className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full bg-[#d4af37]/10 blur-2xl" />
      <div className="flex items-start gap-3 mb-4">
        <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/70 border border-[#eadfcb] items-center justify-center text-2xl shadow-sm">✂️</div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-[#8a7350] font-semibold">Top Services</div>
          <div className="font-playfair text-2xl sm:text-3xl text-slate-900 leading-tight">Most Booked</div>
          <div className="text-xs text-slate-500 mt-0.5">Your most loved services this month</div>
        </div>
      </div>
      {services.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center bg-white/60 rounded-2xl border border-dashed border-[#e3d5bd]">No bookings yet</div>
      ) : (
        <ul className="space-y-3" data-testid="top-services-rows">
          {services.slice(0, 6).map((sv, i) => (
            <li key={sv.name} className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }} data-testid={`top-service-${i}`}>
              <div className="w-10 h-10 rounded-full bg-white/80 border border-[#eadfcb] flex items-center justify-center text-lg shadow-sm flex-shrink-0">{svcIcon(sv.name)}</div>
              <div className="w-24 sm:w-28 text-sm font-medium text-slate-800 leading-tight truncate" title={sv.name}>{sv.name}</div>
              <div className="flex-1 h-5 rounded-full bg-white/70 border border-[#eadfcb] overflow-hidden relative">
                <div className={`h-full rounded-full bg-gradient-to-r ${ROSE_BARS[i] || ROSE_BARS[4]} transition-[width] duration-700`} style={{ width: `${Math.max(10, (sv.count / max) * 100)}%` }} />
                {sv.count / max < 0.6 && <span className="absolute inset-y-0 flex items-center text-[11px] font-semibold text-slate-700" style={{ left: `calc(${Math.max(10, (sv.count / max) * 100)}% + 8px)` }}>{sv.count}</span>}
              </div>
              <div className="w-6 text-right text-sm font-semibold text-slate-800">{sv.count}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 pt-4 border-t border-[#e3d5bd] flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.22em] text-[#8a7350]">
        <span className="text-base">🪷</span><span className="h-px w-8 bg-[#d6c7ab]" /><span>Beauty brings out confidence</span><span className="h-px w-8 bg-[#d6c7ab]" /><span className="text-base">🍃</span>
      </div>
    </div>
  );
}

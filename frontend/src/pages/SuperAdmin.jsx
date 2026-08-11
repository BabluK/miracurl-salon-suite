import { useEffect, useState, useCallback } from "react";
import log from "@/lib/log";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Building2, Plus, LogOut, X, Crown, ExternalLink, Trash2, Upload, Receipt, Gift, Trophy, Bell, Send, TrendingUp, Download, IndianRupee, Sparkles, Eye, Inbox, Wrench, Users, Pencil, Clapperboard, Stethoscope, Eraser, CreditCard, Menu } from "lucide-react";
import { toast } from "sonner";
import ImportCustomersModal from "./ImportCustomersModal";
import PayLinkModal from "@/components/superadmin/PayLinkModal";
import SmsLogModal from "@/components/superadmin/SmsLogModal";
import BillingPanel from "./BillingPanel";
import { SmsCreditLog } from "@/components/superadmin/SmsCreditLog";
import { DummyCleanupModal } from "@/components/superadmin/DummyCleanupModal";
import { PartnersPanel } from "@/components/superadmin/PartnersPanel";
import { SecurityCard } from "@/components/superadmin/SecurityCard";
import { EditTenantModal } from "@/components/superadmin/EditTenantModal";
import { Handshake, ShieldAlert } from "lucide-react";
import { setActAsSalon } from "@/lib/api";
import { SuperProfileCard, HealthBadge, AiInsightsPanel, RenewalNudge, HqInbox } from "@/components/SuperAdminExtras";
import EngineerPanel from "@/components/EngineerPanel";
import { LeaderboardPanel, RevenuePanel, HiringEarningsReview } from "@/components/superadmin/LeaderboardRevenue";
import { OnboardingStudio } from "@/components/superadmin/OnboardingStudio";
import { PromoVideoStudio } from "@/components/superadmin/PromoVideoStudio";
import { SuperNotifBell, StatusActionButton } from "@/components/superadmin/SuperNotifBell";
import { InquiriesPanel } from "@/components/superadmin/InquiriesPanel";
import { BrandKitPanel } from "@/components/superadmin/BrandKitPanel";
import { PlatformLoadPanel } from "@/components/superadmin/PlatformLoadPanel";
import { DatabasePanel } from "@/components/superadmin/DatabasePanel";
import { PromoImageStudio } from "@/components/superadmin/PromoImageStudio";
import { VerifiedStaffPanel } from "@/components/superadmin/VerifiedStaffPanel";
import { MiracurlTeamPanel } from "@/components/superadmin/MiracurlTeamPanel";
import { DeploymentHistoryPanel } from "@/components/superadmin/DeploymentHistoryPanel";
import { DemoCalendar } from "@/components/superadmin/DemoCalendar";
import { VeoAdStudio } from "@/components/superadmin/VeoAdStudio";
import { MiraStudioPanel } from "@/components/superadmin/MiraStudioPanel";
import { MiraLeadAgent } from "@/components/superadmin/MiraLeadAgent";
import { MiraHome } from "@/components/superadmin/MiraHome";
import { FollowUpPipeline } from "@/components/superadmin/FollowUpPipeline";
import { PlatformOverview } from "@/components/superadmin/PlatformOverview";
import { DiagnoseTenantModal } from "@/components/superadmin/DiagnoseTenantModal";
import { HiringPanel } from "@/components/superadmin/HiringPanel";
import { NotificationsPanel } from "@/components/superadmin/NotificationsPanel";
import { Super3DBackdrop } from "@/components/superadmin/Super3DBackdrop";
import { PlatformOrbitMap } from "@/components/superadmin/PlatformOrbitMap";
import { DocsPanel } from "@/components/superadmin/DocsPanel";
import { StripePaymentsPanel } from "@/components/superadmin/StripePaymentsPanel";
import { DemoCampaign } from "@/components/superadmin/DemoCampaign";
import { SiteInfoPanel } from "@/components/superadmin/SiteInfoPanel";
import { Globe } from "lucide-react";
import { Mail } from "lucide-react";
import { PlatformEarnings } from "@/components/superadmin/PlatformEarnings";
import { MiraVoiceAssistant } from "@/components/superadmin/MiraVoiceAssistant";
import { FileText } from "lucide-react";
import { BellRing, Orbit, Star } from "lucide-react";
import { FeedbackPanel } from "@/components/superadmin/FeedbackPanel";
import { BadgeCheck, Rocket } from "lucide-react";
import { Briefcase } from "lucide-react";
import { NetSpeedIndicator } from "@/components/NetSpeedIndicator";
import { Palette, Activity, Database, ImagePlus } from "lucide-react";

const PLAN_BADGE = {
  starter: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  pro: "bg-sky-50 text-sky-600 border-sky-300",
  enterprise: "bg-blush/10 text-blush border-blush/30",
};
const STATUS_BADGE = {
  trial: "bg-amber-500/10 text-amber-400",
  active: "bg-emerald-500/10 text-emerald-400",
  suspended: "bg-red-500/10 text-red-400",
  cancelled: "bg-slate-50 text-slate-400",
};

export default function SuperAdmin() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [overview, setOverview] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [hqUnread, setHqUnread] = useState(0);
  const [inquiryNew, setInquiryNew] = useState(0);
  const [hiringNew, setHiringNew] = useState(0);
  useEffect(() => {
    api.get("/super-admin/hiring").then(r => setHiringNew(r.data.new_applications)).catch(() => {});
  }, []);
  const [sendingReports, setSendingReports] = useState(false);
  const [sendingWeekly, setSendingWeekly] = useState(false);

  async function sendMonthlyReports() {
    if (!window.confirm("Email last month's business report to every active/trial salon owner?")) return;
    setSendingReports(true);
    try {
      const { data } = await api.post("/super-admin/send-monthly-report", {});
      toast.success(`${data.month} reports: ${data.sent} sent${data.failed ? `, ${data.failed} failed` : ""}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send reports");
    } finally { setSendingReports(false); }
  }
  async function sendWeeklyReports() {
    if (!window.confirm("Email last week's business snapshot to every active/trial salon owner?")) return;
    setSendingWeekly(true);
    try {
      const { data } = await api.post("/super-admin/send-weekly-report", {});
      toast.success(`Week ${data.week}: ${data.sent} sent${data.failed ? `, ${data.failed} failed` : ""}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send weekly snapshots");
    } finally { setSendingWeekly(false); }
  }
  const [open, setOpen] = useState(false);
  const [editFor, setEditFor] = useState(null); // tenant being edited
  const [diagFor, setDiagFor] = useState(null); // tenant being diagnosed
  const [importFor, setImportFor] = useState(null); // tenant being imported into
  const [payLinkFor, setPayLinkFor] = useState(null); // tenant getting a payment link
  const [smsLogFor, setSmsLogFor] = useState(null); // tenant whose SMS log is open
  const [cleanFor, setCleanFor] = useState(null); // tenant being cleaned of dummy data
  const [tab, setTab] = useState("mira-home"); // tenants | billing
  const [navOpen, setNavOpen] = useState(false);
  const [platformLogo, setPlatformLogo] = useState("");
  useEffect(() => {
    api.get("/public/site-info").then((r) => setPlatformLogo(r.data.platform_logo || "")).catch(() => {});
  }, []);
  const [notifFeed, setNotifFeed] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    slug: "", name: "", owner_email: "", owner_name: "", owner_password: "",
    location: "", phone: "", salon_email: "", owner_phone: "", plan: "starter",
  });

  const load = useCallback(async () => {
    const [o, t, hq, inq, nf] = await Promise.all([
      api.get("/super-admin/overview"),
      api.get("/super-admin/tenants"),
      api.get("/super-admin/hq-messages").catch(() => ({ data: { unread: 0 } })),
      api.get("/super-admin/inquiries").catch(() => ({ data: { new_count: 0 } })),
      api.get("/super-admin/notifications").catch(() => ({ data: { items: [], unread: 0 } })),
    ]);
    setOverview(o.data);
    setTenants(t.data);
    setHqUnread(hq.data.unread || 0);
    setInquiryNew(inq.data.new_count || 0);
    setNotifFeed(nf.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const demoHot = (notifFeed?.items || []).filter(i => i.type === "demo" && i.unread).length;
  useEffect(() => {
    if (tab !== "lead-email") return;
    const t = setTimeout(() => {
      api.get("/super-admin/notifications").then(r => setNotifFeed(r.data)).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [tab]);

  const [createdCreds, setCreatedCreds] = useState(null);

  function startNew() {
    setForm({ slug: "", name: "", owner_email: "", owner_name: "", location: "", phone: "", salon_email: "", owner_phone: "", plan: "starter" });
    setOpen(true);
  }

  function convertLead(inq) {
    const slug = inq.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    setForm({ slug, name: `${inq.name}'s Salon`, owner_email: inq.email, owner_name: inq.name, location: "", phone: inq.phone, salon_email: inq.email, owner_phone: inq.phone, plan: "starter" });
    setTab("tenants");
    setOpen(true);
    toast.info(`Lead "${inq.name}" pre-filled — review details and create the salon ✦`);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      // Strip empty owner_password so Pydantic Optional[str] accepts it as None
      // and the server generates a memorable temp password automatically.
      const { owner_password: _unused, ...payload } = form;
      const { data } = await api.post("/super-admin/tenants", payload);
      if (data?.linked_existing_owner) {
        toast.success(`'${form.slug}' created & tagged to ${data.owner_email} — this owner now has ${data.owner_salon_count} salons on one login`, { duration: 8000 });
      } else {
        toast.success(`Tenant '${form.slug}' created`);
      }
      setOpen(false);
      if (data?.temp_password) {
        setCreatedCreds({
          email: data.owner_email,
          temp_password: data.temp_password,
          tenant_name: data.tenant?.name,
          tenant_phone: form.phone,
          email_recipients: data.email_recipients,
          email_status: data.email_status,
        });
      }
      load();
    } catch (err) {
      // Pydantic returns detail as an array of error objects — render safely.
      const raw = err.response?.data?.detail;
      let msg = "Couldn't create tenant";
      if (Array.isArray(raw)) {
        msg = raw.map((x) => `${(x.loc || []).slice(-1)}: ${x.msg}`).join(" · ");
      } else if (typeof raw === "string") {
        msg = raw;
      }
      toast.error(msg);
    } finally { setBusy(false); }
  }

  async function setStatus(t, status) {
    try {
      await api.put(`/super-admin/tenants/${t.id}`, { status });
      toast.success(`${t.name} → ${status}`);
      load();
    } catch (err) { toast.error("Update failed"); }
  }

  async function reactivateTenant(t) {
    if (!window.confirm(`Re-onboard ${t.name}? The salon comes back with all its old data, gets a 7-day grace period, a fresh owner password is generated and emailed.`)) return;
    try {
      const { data } = await api.post(`/super-admin/tenants/${t.id}/reactivate`);
      toast.success(`${t.name} is back — grace period till ${data.trial_end_date}`);
      setCreatedCreds({
        email: data.owner_email,
        temp_password: data.temp_password,
        tenant_name: t.name,
        tenant_phone: t.phone,
        email_recipients: data.email_recipients,
        email_status: data.email_status,
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Reactivation failed");
    }
  }

  async function deleteTenant(t) {
    if (!window.confirm(`Cancel subscription for ${t.name}? Their account will be disabled (data kept — reversible via Reactivate).`)) return;
    try { await api.delete(`/super-admin/tenants/${t.id}`); toast.success("Tenant cancelled"); load(); }
    catch (err) { toast.error("Delete failed"); }
  }

  const [permDelete, setPermDelete] = useState(null); // tenant pending permanent delete
  const [permTyped, setPermTyped] = useState("");

  function permanentDeleteTenant(t) { setPermTyped(""); setPermDelete(t); }

  async function confirmPermanentDelete() {
    const t = permDelete;
    if (permTyped.trim() !== t.slug) { toast.error("Slug didn't match — deletion cancelled"); return; }
    try {
      const { data } = await api.delete(`/super-admin/tenants/${t.id}/permanent?confirm=${encodeURIComponent(t.slug)}`);
      const n = Object.values(data.records_removed || {}).reduce((a, b) => a + b, 0);
      toast.success(`"${data.deleted_salon}" permanently deleted (${n} records removed)`);
      setPermDelete(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Permanent delete failed");
    }
  }

  async function creditSms(t) {
    const val = window.prompt(`Add SMS points for ${t.name} (current balance: ${t.sms_points || 0})\n1 point = 1 customer SMS (booking confirmations, billing receipts, 24h reminders)`, "100");
    if (!val) return;
    const points = parseInt(val, 10);
    if (!points || points < 1) { toast.error("Enter a positive number of points"); return; }
    try {
      const { data } = await api.post(`/super-admin/tenants/${t.id}/sms-points`, { points });
      toast.success(`${t.name} now has ${data.sms_points} SMS points`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't credit SMS points"); }
  }

  function publicBookingUrl(slug) {
    return `${window.location.origin}/book/${slug}`;
  }

  const filteredTenants = statusFilter === "all" ? tenants : tenants.filter(t => t.status === statusFilter);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-sky-50/70 to-violet-100/60 text-slate-800" data-testid="super-admin-page">
      <Super3DBackdrop />
      {/* Header */}
      <header className="border-b border-indigo-900/40 bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-950 sticky top-0 z-40 shadow-lg shadow-indigo-950/20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="relative w-9 h-9 sm:w-11 sm:h-11 shrink-0 rounded-full bg-[#1c1c22] flex items-center justify-center shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/60">
              <img src={platformLogo || "/assets/brand/ms-ring.png"} alt="Miracurl" className={`w-7 h-7 sm:w-8 sm:h-8 ${platformLogo ? "rounded-full object-cover" : "object-contain"}`} draggable="false" data-testid="hq-logo" />
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" title="Systems online" />
            </div>
            <div className="min-w-0">
              <div className="font-playfair text-base sm:text-xl text-white flex items-center gap-2 whitespace-nowrap">
                Miracurl HQ
                <span data-testid="super-admin-badge" className="super-badge hidden sm:inline-flex items-center gap-1 text-[9px] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-full text-slate-900 whitespace-nowrap">
                  <Sparkles className="w-3 h-3" /> Super Admin
                </span>
              </div>
              <div className="text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.25em] uppercase text-amber-300/80 truncate">Command Console · AI-Powered</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden md:block"><NetSpeedIndicator /></div>
            <SuperNotifBell tenants={tenants} hqUnread={hqUnread} onGoInbox={() => setTab("inbox")} />
            <MiraVoiceAssistant onGoTab={setTab} />
            <span className="text-xs text-white/50 hidden lg:inline">{user?.email}</span>
            <button data-testid="super-logout-btn" onClick={async () => { await logout(); nav("/login"); }} className="flex items-center gap-2 text-xs font-bold px-2.5 sm:px-4 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-slate-900 hover:brightness-110 shadow-lg shadow-amber-500/25 transition">
              <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-10 space-y-5 sm:space-y-6 pb-24">
        {/* Super-admin profile */}
        <SuperProfileCard />

        {/* Top navigation + content */}
        <div className="space-y-4">
        {(() => {
          const NAV_ITEMS = [
              { id: "mira-home", label: "Mira Home", icon: Sparkles, top: true },
              { id: "platform-map", label: "Platform Map", icon: Orbit, top: true },
              { id: "pipeline", label: "Follow-up Pipeline", icon: TrendingUp, top: true },
              { id: "tenants", label: "Tenants", icon: Building2, top: true },
              { id: "notifications", label: "Notifications", icon: BellRing, badge: notifFeed?.unread || 0, top: true },
              { id: "billing", label: "Billing & Subscriptions", icon: Receipt, top: true },
              { id: "revenue", label: "Revenue", icon: TrendingUp, top: true },
              { id: "mira-leads", label: "Mira Lead Agent", icon: Sparkles, top: true },
              { id: "inbox", label: "HQ Inbox", icon: Inbox, badge: hqUnread, top: true },
              { id: "partners", label: "Partners", icon: Handshake },
              { id: "leaderboard", label: "Top Referrers", icon: Trophy },
              { id: "docs", label: "Documents", icon: FileText },
              { id: "lead-email", label: "Lead Gen Email", icon: Mail, badge: demoHot, hot: demoHot > 0 },
              { id: "demo-calendar", label: "Demo Calendar", icon: Bell },
              { id: "ai", label: "AI Insights", icon: Sparkles },
              { id: "inquiries", label: "Leads & Inquiries", icon: Users, badge: inquiryNew },
              { id: "mira-studio", label: "Mira Studio Users", icon: Sparkles },
              { id: "hiring", label: "Hiring", icon: Briefcase, badge: hiringNew },
              { id: "feedback", label: "Feedback", icon: Star },
              { id: "engineer", label: "AI Engineer", icon: Wrench },
              { id: "onboarding", label: "Onboarding Image", icon: Sparkles },
              { id: "promo", label: "Promo Video", icon: Clapperboard },
              { id: "brandkit", label: "Brand Kit", icon: Palette },
              { id: "posters", label: "AI Posters", icon: ImagePlus },
              { id: "verify-staff", label: "Staff Verification", icon: BadgeCheck },
              { id: "team", label: "Miracurl Team", icon: Crown },
              { id: "website", label: "Website & CEO", icon: Globe },
              { id: "deployments", label: "Deployments", icon: Rocket },
              { id: "load", label: "Platform Load", icon: Activity },
              { id: "database", label: "Database", icon: Database },
              { id: "security", label: "Security", icon: ShieldAlert },
          ];
          const renderBtn = (item, full = false) => (
              <button key={item.id} data-testid={`super-tab-${item.id}`} onClick={() => { setTab(item.id); setNavOpen(false); }}
                className={`shrink-0 ${full ? "w-full" : ""} text-left px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2.5 transition ${tab === item.id ? "bg-slate-900 text-white" : item.hot ? "text-amber-600 bg-amber-50 animate-pulse hover:bg-amber-100" : "text-slate-600 hover:bg-slate-100"}`}>
                <item.icon className={`w-4 h-4 shrink-0 ${item.hot && tab !== item.id ? "text-amber-500" : ""}`} />
                <span className="whitespace-nowrap">{item.label}</span>
                {item.hot && <span className="text-xs" aria-hidden>🔥</span>}
                {item.badge > 0 && (
                  <span className={`ml-auto relative min-w-[18px] h-[18px] px-1 rounded-full ${item.hot ? "bg-amber-500" : "bg-rose-500"} text-white text-[10px] font-bold inline-flex items-center justify-center`}>
                    {item.hot && <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-70" aria-hidden />}
                    <span className="relative">{item.badge}</span>
                  </span>
                )}
              </button>
          );
          const moreBadge = NAV_ITEMS.filter(i => !i.top).reduce((s, i) => s + (i.badge || 0), 0);
          return (
            <>
              <aside className="w-full sticky top-2 z-30">
                <nav data-testid="super-sidebar" className="super-topnav flex items-center gap-1 overflow-x-auto bg-white/95 backdrop-blur border border-slate-200 rounded-2xl p-2 shadow-sm">
                  <button data-testid="super-nav-more" onClick={() => setNavOpen(true)}
                    className="shrink-0 px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200 text-slate-700 hover:border-slate-400 transition">
                    <Menu className="w-4 h-4" /> All
                    {moreBadge > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold inline-flex items-center justify-center">{moreBadge}</span>}
                  </button>
                  <span className="w-px h-6 bg-slate-200 shrink-0" />
                  {NAV_ITEMS.filter(i => i.top).map(i => renderBtn(i))}
                </nav>
              </aside>
              {navOpen && (
                <div className="fixed inset-0 z-[70]" data-testid="super-nav-drawer">
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
                  <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl p-3 overflow-y-auto"
                    style={{ animation: "superDrawerIn .28s cubic-bezier(.2,.8,.3,1)" }}>
                    <style>{"@keyframes superDrawerIn{from{transform:translateX(-100%);opacity:.4}to{transform:translateX(0);opacity:1}}"}</style>
                    <div className="flex items-center justify-between px-2 py-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">All sections</span>
                      <button onClick={() => setNavOpen(false)} data-testid="super-nav-drawer-close" className="text-slate-400 hover:text-slate-900"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="space-y-0.5">
                      <div className="px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-500">Pinned on top</div>
                      {NAV_ITEMS.filter(i => i.top).map(i => renderBtn(i, true))}
                      <div className="px-2 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">More tools</div>
                      {NAV_ITEMS.filter(i => !i.top).map(i => renderBtn(i, true))}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
        <div className="flex-1 min-w-0 w-full space-y-6">

        {(() => {
          const panels = {
            "mira-home": <MiraHome onGoTab={setTab} user={user} />,
            pipeline: <FollowUpPipeline onGoTab={setTab} />,
            notifications: <NotificationsPanel feed={notifFeed} onGoTab={setTab} onRefresh={() => api.get("/super-admin/notifications").then(r => setNotifFeed(r.data)).catch(() => {})} />,
            "platform-map": <div className="space-y-6"><PlatformOverview onGoTab={setTab} /><PlatformOrbitMap onGoTab={setTab} /></div>,
            billing: <div className="space-y-6"><StripePaymentsPanel /><BillingPanel tenants={tenants} /></div>,
            partners: <PartnersPanel />,
            leaderboard: <LeaderboardPanel />,
            revenue: <div className="space-y-6"><PlatformEarnings /><HiringEarningsReview /><RevenuePanel /></div>,
            docs: <DocsPanel />,
            "mira-leads": <MiraLeadAgent />,
            "demo-calendar": <DemoCalendar />,
            "lead-email": (
              <div className="space-y-6" data-testid="lead-email-panel">
                <div>
                  <h1 className="font-playfair text-3xl flex items-center gap-3"><Mail className="w-7 h-7 text-amber-500" /> Lead Generation Email</h1>
                  <p className="text-slate-500 text-sm mt-1">Invite prospective salons to a demo — suite details, pricing and all brochures attached.</p>
                </div>
                <DemoCampaign />
              </div>
            ),
            ai: <AiInsightsPanel />,
            inbox: <HqInbox onUnreadChange={setHqUnread} />,
            feedback: <FeedbackPanel />,
            inquiries: <InquiriesPanel onNewCount={setInquiryNew} onConvert={convertLead} />,
            "mira-studio": <MiraStudioPanel />,
            hiring: <HiringPanel onNewCount={setHiringNew} />,
            engineer: <EngineerPanel />,
            onboarding: <OnboardingStudio tenants={tenants} />,
            promo: <div className="space-y-6"><VeoAdStudio /><PromoVideoStudio /></div>,
            brandkit: <BrandKitPanel />,
            posters: <PromoImageStudio />,
            "verify-staff": <VerifiedStaffPanel />,
            team: <MiracurlTeamPanel />,
            website: <SiteInfoPanel />,
            deployments: <DeploymentHistoryPanel />,
            load: <PlatformLoadPanel />,
            database: <DatabasePanel />,
            security: <SecurityCard />,
          };
          return panels[tab];
        })() || (
          <>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-playfair text-3xl">Tenants</h1>
            <p className="text-slate-500 text-sm mt-1">Manage every salon on the Miracurl platform.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              data-testid="super-weekly-report-btn"
              onClick={sendWeeklyReports}
              disabled={sendingWeekly}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sky-300 bg-sky-50 text-sky-700 text-sm font-medium hover:bg-sky-100 disabled:opacity-50"
              title="Email last week's business snapshot to every active salon owner"
            >
              <Send className="w-4 h-4" /> {sendingWeekly ? "Sending…" : "Email weekly snapshots"}
            </button>
            <button
              data-testid="super-monthly-report-btn"
              onClick={sendMonthlyReports}
              disabled={sendingReports}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50"
              title="Email last month's business report to every active salon owner"
            >
              <Send className="w-4 h-4" /> {sendingReports ? "Sending…" : "Email monthly reports"}
            </button>
            <button data-testid="super-new-tenant-btn" onClick={startNew} className="btn-blue flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Tenant
            </button>
          </div>
        </div>

        {/* KPIs */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <button onClick={() => setStatusFilter("all")} className={`card-light text-left transition hover:shadow-md ${statusFilter === "all" ? "ring-2 ring-sky-400" : ""}`} data-testid="kpi-total-tenants">
              <div className="label-light">Total Tenants</div>
              <div className="flex items-end justify-between mt-2">
                <div className="font-playfair text-4xl text-sky-600">{overview.total_tenants}</div>
                <Building2 className="w-8 h-8 text-sky-600 opacity-30" />
              </div>
            </button>
            {Object.entries(overview.by_status).map(([k, v]) => (
              <button key={k} onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}
                className={`card-light text-left transition hover:shadow-md ${statusFilter === k ? "ring-2 ring-sky-400" : ""}`}
                data-testid={`kpi-status-${k}`}>
                <div className="label-light capitalize">{k}</div>
                <div className="font-playfair text-4xl mt-2">{v}</div>
                <div className={`text-[10px] uppercase tracking-wider mt-2 px-2 py-1 rounded inline-block ${STATUS_BADGE[k] || ''}`}>{k}</div>
              </button>
            ))}
          </div>
        )}

        {/* Status filter chips */}
        <div className="flex items-center gap-2 flex-wrap" data-testid="tenant-status-filters">
          {["all", "active", "trial", "cancelled", "suspended"].map(s => (
            <button key={s} data-testid={`filter-${s}`} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3.5 py-1.5 rounded-full border capitalize transition ${
                statusFilter === s
                  ? "bg-slate-900 text-white border-slate-900 shadow"
                  : "bg-white/70 border-slate-200 text-slate-500 hover:border-slate-400"}`}>
              {s === "all" ? `All (${tenants.length})` : `${s} (${tenants.filter(t => t.status === s).length})`}
            </button>
          ))}
          {statusFilter !== "all" && (
            <span className="text-xs text-slate-400">showing {filteredTenants.length} salon(s)</span>
          )}
        </div>

        {/* Tenant list — readable cards */}
        <div className="space-y-3">
          {filteredTenants.map(t => (
            <div key={t.id} data-testid={`tenant-row-${t.id}`} className="card-light !p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-playfair font-semibold text-base truncate max-w-[340px]" title={t.name}>{t.name}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${PLAN_BADGE[t.plan] || ''}`}>{t.plan}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
                    {t.currency && t.currency !== "INR" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200" title={`International salon — pays in ${t.currency} via Stripe`}>🌍 {t.currency}</span>
                    )}
                    <HealthBadge t={t} /><RenewalNudge t={t} />
                  </div>
                  <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5 text-xs text-slate-500">
                    {t.location && <span className="truncate max-w-[260px]" title={t.location}>📍 {t.location}</span>}
                    <span className="font-mono text-sky-600">{t.slug}</span>
                    <span className="flex items-center gap-1.5 truncate max-w-[280px]">
                      👤 {t.owner_email}
                      {(t.owner_salon_count || 1) > 1 && (
                        <span data-testid={`salon-count-${t.id}`} title={`This owner email manages ${t.owner_salon_count} salons`}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200">×{t.owner_salon_count}</span>
                      )}
                    </span>
                    {t.salon_email && t.salon_email !== t.owner_email && <span className="truncate max-w-[220px]" title={`Salon email: ${t.salon_email}`}>✉️ {t.salon_email}</span>}
                    <a href={publicBookingUrl(t.slug)} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline flex items-center gap-1" data-testid={`booking-link-${t.id}`}>
                      <ExternalLink className="w-3 h-3" /> /book/{t.slug}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5 border border-slate-100 rounded-lg px-2.5 py-1.5" title="SMS points">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">SMS</span>
                    <button data-testid={`sms-balance-${t.id}`} onClick={() => setSmsLogFor(t)} title="View SMS delivery log" className={`text-xs font-bold hover:underline ${(t.sms_points || 0) < 20 ? "text-amber-600" : "text-emerald-700"}`}>{t.sms_points || 0}</button>
                    <button data-testid={`sms-points-${t.id}`} onClick={() => creditSms(t)} title="Credit SMS points"
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition">+ Add</button>
                  </div>
                  <div className="flex items-center gap-0.5 border border-slate-100 rounded-lg px-1.5 py-1">
                    <button data-testid={`open-salon-${t.id}`} onClick={() => { setActAsSalon(t.slug, t.name); nav("/dashboard"); }} title="Open salon workspace (edit & correct — no deletes)" className="p-1.5 text-violet-600 hover:bg-violet-50 rounded"><Eye className="w-3.5 h-3.5" /></button>
                    <button data-testid={`diagnose-tenant-${t.id}`} onClick={() => setDiagFor(t)} title="Diagnose — find why this salon feels slow & clear their cache" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Stethoscope className="w-3.5 h-3.5" /></button>
                    <button data-testid={`edit-tenant-${t.id}`} onClick={() => setEditFor(t)} title="Edit salon details, credentials & branch links" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                    <button data-testid={`pay-link-${t.id}`} onClick={() => setPayLinkFor(t)} title="Generate subscription payment link — tenant pays, plan activates" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"><CreditCard className="w-3.5 h-3.5" /></button>
                    <button data-testid={`import-customers-${t.id}`} onClick={() => setImportFor(t)} title="Import customers" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Upload className="w-3.5 h-3.5" /></button>
                    <button data-testid={`clean-dummy-${t.id}`} onClick={() => setCleanFor(t)} title="Clean test/dummy bookings & customers" className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"><Eraser className="w-3.5 h-3.5" /></button>
                    <StatusActionButton t={t} setStatus={setStatus} reactivateTenant={reactivateTenant} />
                    <span className="w-px h-4 bg-slate-200 mx-0.5" />
                    <button data-testid={`delete-tenant-${t.id}`} onClick={() => deleteTenant(t)} title="Cancel subscription" className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    <button data-testid={`permanent-delete-tenant-${t.id}`} onClick={() => permanentDeleteTenant(t)} title="Permanently delete (erase all data — irreversible)" className="p-1.5 text-slate-400 hover:text-white hover:bg-red-600 rounded"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {tenants.length === 0 && <div className="card-light text-center text-slate-500 py-12">No tenants yet. Add your first salon!</div>}
          {tenants.length > 0 && filteredTenants.length === 0 && <div className="card-light text-center text-slate-400 py-10">No {statusFilter} salons.</div>}
        </div>

        <SmsCreditLog />
          </>
        )}
        </div>
        </div>
      </main>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">Onboard a New Salon</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="label-light block mb-1">Slug *</label>
                <input data-testid="tenant-slug-input" required pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?" className="input-light font-mono lowercase" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="elegance-koramangala" />
                <p className="text-[10px] text-slate-400 mt-1">Will appear in their booking URL: /book/<span className="text-sky-600">{form.slug || "your-slug"}</span></p>
              </div>
              <div>
                <label className="label-light block mb-1">Salon Name *</label>
                <input data-testid="tenant-name-input" required className="input-light" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Elegance Beauty Lounge" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Owner Name *</label>
                  <input data-testid="tenant-owner-name-input" required className="input-light" value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} />
                </div>
                <div>
                  <label className="label-light block mb-1">Plan</label>
                  <select className="text-slate-800 input-light" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label-light block mb-1">Owner Email (personal) *</label>
                <input data-testid="tenant-owner-email-input" type="email" required className="input-light" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} placeholder="owner@gmail.com" />
                <p className="text-[10px] text-slate-400 mt-0.5">Used for login. Login details are sent to this AND the salon email.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Salon Email</label>
                  <input data-testid="tenant-salon-email-input" type="email" className="input-light" value={form.salon_email} onChange={e => setForm({ ...form, salon_email: e.target.value })} placeholder="hello@salon.com" />
                </div>
                <div>
                  <label className="label-light block mb-1">Owner Personal Phone</label>
                  <input data-testid="tenant-owner-phone-input" className="input-light" value={form.owner_phone} onChange={e => setForm({ ...form, owner_phone: e.target.value })} placeholder="+91 98…" />
                  <p className="text-[10px] text-slate-400 mt-0.5">WhatsApp renewal reminders go here.</p>
                </div>
              </div>
              <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-[11px] text-sky-800">
                ℹ️ A secure one-time password will be generated automatically and shown to you after creation. Share it with the owner — they&apos;ll be forced to change it on first login.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Location</label>
                  <input className="input-light" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label className="label-light block mb-1">Salon Phone</label>
                  <input className="input-light" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="tenant-save-btn" type="submit" disabled={busy} className="btn-blue flex-1">{busy ? "Creating..." : "Onboard Salon"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importFor && (
        <ImportCustomersModal
          tenant={importFor}
          onClose={() => setImportFor(null)}
          onDone={load}
        />
      )}

      {payLinkFor && <PayLinkModal tenant={payLinkFor} onClose={() => setPayLinkFor(null)} />}

      {smsLogFor && <SmsLogModal tenant={smsLogFor} onClose={() => setSmsLogFor(null)} />}

      {editFor && (
        <EditTenantModal
          tenant={editFor}
          onClose={() => setEditFor(null)}
          onSaved={async () => { setEditFor(null); await load(); }}
        />
      )}

      {diagFor && <DiagnoseTenantModal tenant={diagFor} onClose={() => setDiagFor(null)} />}
      {cleanFor && <DummyCleanupModal tenant={cleanFor} onClose={() => setCleanFor(null)} />}

      {createdCreds && (
        <TempPasswordShareModal
          creds={createdCreds}
          onClose={() => setCreatedCreds(null)}
        />
      )}

      {permDelete && (
        <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPermDelete(null)} data-testid="perm-delete-modal">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-rose-600 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Trash2 className="w-4 h-4" /> Permanent Delete — {permDelete.name}
              </div>
              <button onClick={() => setPermDelete(null)} className="text-white/70 hover:text-white" data-testid="perm-delete-close"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-xs text-rose-800 leading-relaxed">
                ⚠️ This erases the salon and <b>ALL its data</b> — customers, invoices, staff, bookings and logins. This <b>CANNOT be undone</b>.
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Type the salon&apos;s slug to confirm</label>
                <div className="text-xs font-mono bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 mt-1 mb-2 text-slate-600 select-all">{permDelete.slug}</div>
                <input autoFocus value={permTyped} onChange={e => setPermTyped(e.target.value)} data-testid="perm-delete-input"
                  placeholder="type slug here…" onKeyDown={e => e.key === "Enter" && permTyped.trim() === permDelete.slug && confirmPermanentDelete()}
                  className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-200" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setPermDelete(null)} data-testid="perm-delete-cancel"
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={confirmPermanentDelete} disabled={permTyped.trim() !== permDelete.slug} data-testid="perm-delete-confirm"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed">
                  Erase permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One-time modal shown to super-admin immediately after tenant creation.
 * Displays the generated temp password + one-click Copy + prefilled WhatsApp
 * share message. Password is displayed exactly ONCE — closing the modal
 * discards it. If lost, the owner uses /forgot-password like anyone else.
 */
function TempPasswordShareModal({ creds, onClose }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const message = [
    `Hi ${creds.tenant_name || "there"} ✦ Welcome to Miracurl!`,
    "",
    `Your salon account is ready. Here are your one-time login details:`,
    "",
    `🔗 Login URL: ${loginUrl}`,
    `📧 Email: ${creds.email}`,
    `🔑 Temp password: ${creds.temp_password}`,
    "",
    "You'll be asked to set your own password right after your first login.",
    "",
    "Any questions? Just reply to this message.",
    "— Miracurl team",
  ].join("\n");

  function copy(text) {
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      log.warn("clipboard failed:", e);
    }
  }

  const waPhone = (creds.tenant_phone || "").replace(/\D/g, "");
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} data-testid="temp-password-share-modal">
        <div className="text-center mb-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl mb-3">✓</div>
          <h3 className="text-xl font-semibold text-slate-900">Tenant created</h3>
          <p className="text-sm text-slate-500 mt-1">Send these one-time credentials to <b>{creds.email}</b></p>
          {creds.email_status && (
            <div data-testid="creds-email-status" className={`mt-2 text-xs rounded-lg px-3 py-2 border ${creds.email_status.sent ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              {creds.email_status.sent
                ? <>📧 Login details emailed to {creds.email_recipients?.join(" & ")}</>
                : <>⚠️ Email couldn&apos;t be delivered ({creds.email_status.error}) — please share the credentials manually below.</>}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Email</label>
              <button onClick={() => copy(creds.email)} className="text-[11px] text-sky-600 hover:text-sky-700">Copy</button>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-sm text-slate-800 break-all" data-testid="temp-creds-email">{creds.email}</div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">One-time password</label>
              <button onClick={() => copy(creds.temp_password)} className="text-[11px] text-sky-600 hover:text-sky-700" data-testid="temp-creds-copy-btn">
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 font-mono text-base font-semibold text-amber-900 break-all" data-testid="temp-creds-password">{creds.temp_password}</div>
            <p className="text-[10px] text-slate-400 mt-1">This password is shown only once. The owner will be forced to change it on first login.</p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600"
            data-testid="temp-creds-whatsapp-btn"
          >
            💬 Send via WhatsApp
          </a>
          <button
            onClick={() => copy(message)}
            className="w-full py-2.5 rounded-lg bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200"
            data-testid="temp-creds-copy-msg-btn"
          >
            Copy full welcome message
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg text-slate-500 text-sm hover:bg-slate-50"
            data-testid="temp-creds-close-btn"
          >
            Done — I&apos;ve shared the credentials
          </button>
        </div>
      </div>
    </div>
  );
}

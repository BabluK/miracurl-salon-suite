import { useEffect, useState, useCallback } from "react";
import log from "@/lib/log";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Building2, Plus, LogOut, X, Crown, ExternalLink, Trash2, Upload, Receipt, Gift, Trophy, Bell, Send, TrendingUp, Download, IndianRupee, Sparkles, Eye, Inbox, Wrench, Users, Pencil, Clapperboard, Stethoscope, Eraser, CreditCard, Menu } from "lucide-react";
import { toast } from "sonner";
import { askConfirm } from "@/components/ConfirmDialog";
import ImportCustomersModal from "./ImportCustomersModal";
import PayLinkModal from "@/components/superadmin/PayLinkModal";
import SmsLogModal from "@/components/superadmin/SmsLogModal";
import BillingPanel from "./BillingPanel";
import { SmsCreditLog } from "@/components/superadmin/SmsCreditLog";
import { DummyCleanupModal } from "@/components/superadmin/DummyCleanupModal";
import { PartnersPanel } from "@/components/superadmin/PartnersPanel";
import { SecurityCard } from "@/components/superadmin/SecurityCard";
import { HqTaxCard } from "@/components/superadmin/HqTaxCard";
import { EditTenantModal } from "@/components/superadmin/EditTenantModal";
import { Handshake, ShieldAlert, ToggleRight } from "lucide-react";
import { TenantFeaturesModal } from "@/components/superadmin/TenantFeaturesModal";
import { setActAsSalon } from "@/lib/api";
import { SuperProfileCard, HealthBadge, AiInsightsPanel, RenewalNudge, HqInbox } from "@/components/SuperAdminExtras";
import EngineerPanel from "@/components/EngineerPanel";
import { LeaderboardPanel, RevenuePanel, HiringEarningsReview } from "@/components/superadmin/LeaderboardRevenue";
import { OnboardingStudio } from "@/components/superadmin/OnboardingStudio";
import { MessageCreditsCard } from "@/components/superadmin/MessageCreditsCard";
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
import { MiraStudioPanel } from "@/components/superadmin/MiraStudioPanel";
import { MiraLeadAgent } from "@/components/superadmin/MiraLeadAgent";
import { ReferralsPanel } from "@/components/superadmin/ReferralsPanel";
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
import { TenantQuickView } from "@/components/superadmin/TenantQuickView";
import { OnboardTenantModal } from "@/components/superadmin/OnboardTenantModal";
import { RewardsCampaignCard } from "@/components/superadmin/RewardsCampaignCard";
import { GrowthAdvisoryPanel } from "@/components/superadmin/GrowthAdvisoryPanel";
import { SuperAdminProfileCard } from "@/components/superadmin/SuperAdminProfileCard";
import { WhatsAppLeadsCard } from "@/components/superadmin/WhatsAppLeadsCard";
import { SiteInfoPanel } from "@/components/superadmin/SiteInfoPanel";
import { Globe } from "lucide-react";
import { Mail } from "lucide-react";
import { PlatformEarnings } from "@/components/superadmin/PlatformEarnings";
import { MiraVoiceAssistant } from "@/components/superadmin/MiraVoiceAssistant";
import { FileText } from "lucide-react";
import { BellRing, Orbit, Star } from "lucide-react";
import { FeedbackPanel } from "@/components/superadmin/FeedbackPanel";
import { AssistQueueCard } from "@/components/superadmin/AssistQueueCard";
import { BadgeCheck, Rocket } from "lucide-react";
import { Briefcase } from "lucide-react";
import { NetSpeedIndicator } from "@/components/NetSpeedIndicator";
import { Palette, Activity, Database, ImagePlus, FileDown, MailCheck, IdCard } from "lucide-react";

async function downloadBlob(url, filename) {
  const r = await api.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(r.data);
  const a = Object.assign(document.createElement("a"), { href, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

function ActionBtn({ icon: Icon, label, onClick, title, tone, testid, strokeWidth }) {
  return (
    <button data-testid={testid} onClick={onClick} title={title}
      className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[9.5px] font-semibold leading-none transition-colors ${tone}`}>
      <Icon className="w-3.5 h-3.5" strokeWidth={strokeWidth || 2} />{label}
    </button>
  );
}

function TenantExportButtons() {
  const [busy, setBusy] = useState("");
  const csv = async () => {
    setBusy("csv");
    try { await downloadBlob("/super-admin/tenants-export.csv", `miracurl-tenants-${new Date().toISOString().slice(0, 10)}.csv`); toast.success("Tenant register downloaded"); }
    catch { toast.error("Download failed"); } finally { setBusy(""); }
  };
  const mail = async () => {
    setBusy("mail");
    try { const { data } = await api.post("/super-admin/tenants-export/email"); toast.success(`Register with ${data.tenants} tenants emailed to ${data.sent_to}`); }
    catch (e) { toast.error(e.response?.data?.detail || "Email failed"); } finally { setBusy(""); }
  };
  return (
    <>
      <button data-testid="tenants-export-csv-btn" onClick={csv} disabled={!!busy} title="Download every tenant's details (owner, contacts, trial & plan dates) as CSV" className="h-9 px-3 rounded-full border border-slate-200 bg-white text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50">
        <FileDown className="w-3.5 h-3.5" /> {busy === "csv" ? "Preparing…" : "Download list"}
      </button>
      <button data-testid="tenants-export-email-btn" onClick={mail} disabled={!!busy} title="Email the full tenant register to booking@miracurl-suite.com" className="h-9 px-3 rounded-full border border-slate-200 bg-white text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50">
        <MailCheck className="w-3.5 h-3.5" /> {busy === "mail" ? "Sending…" : "Email to booking@"}
      </button>
    </>
  );
}

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
  const [offerStats, setOfferStats] = useState(null);
  useEffect(() => {
    api.get("/super-admin/newbiz-offer-stats").then(r => setOfferStats(r.data)).catch(() => {});
  }, []);
  const [hqUnread, setHqUnread] = useState(0);
  const [inquiryNew, setInquiryNew] = useState(0);
  const [hiringNew, setHiringNew] = useState(0);
  useEffect(() => {
    api.get("/super-admin/hiring").then(r => setHiringNew(r.data.new_applications)).catch(() => {});
  }, []);
  const [sendingReports, setSendingReports] = useState(false);
  const [sendingWeekly, setSendingWeekly] = useState(false);

  async function sendMonthlyReports() {
    askConfirm({
      title: "Send monthly reports?", message: "Emails last month's business report to every active/trial salon owner.", confirmLabel: "Send now",
      action: async () => {
        setSendingReports(true);
        try {
          const { data } = await api.post("/super-admin/send-monthly-report", {});
          toast.success(`${data.month} reports: ${data.sent} sent${data.failed ? `, ${data.failed} failed` : ""}`);
        } catch (e) {
          toast.error(e.response?.data?.detail || "Couldn't send reports");
        } finally { setSendingReports(false); }
      },
    });
  }
  async function sendWeeklyReports() {
    askConfirm({
      title: "Send weekly snapshots?", message: "Emails last week's business snapshot to every active/trial salon owner.", confirmLabel: "Send now",
      action: async () => {
        setSendingWeekly(true);
        try {
          const { data } = await api.post("/super-admin/send-weekly-report", {});
          toast.success(`Week ${data.week}: ${data.sent} sent${data.failed ? `, ${data.failed} failed` : ""}`);
        } catch (e) {
          toast.error(e.response?.data?.detail || "Couldn't send weekly snapshots");
        } finally { setSendingWeekly(false); }
      },
    });
  }
  const [open, setOpen] = useState(false);
  const [editFor, setEditFor] = useState(null); // tenant being edited
  const [quickFor, setQuickFor] = useState(null); // tenant open in the quick-view drawer
  const profilePdf = (t) => downloadBlob(`/super-admin/tenants/${t.id}/profile.pdf`, `Miracurl-Account-Profile-${t.slug}.pdf`).then(() => toast.success("Account profile PDF downloaded")).catch(() => toast.error("Couldn't build the PDF"));
  const [diagFor, setDiagFor] = useState(null); // tenant being diagnosed
  const [importFor, setImportFor] = useState(null); // tenant being imported into
  const [payLinkFor, setPayLinkFor] = useState(null); // tenant getting a payment link
  const [smsLogFor, setSmsLogFor] = useState(null); // tenant whose SMS log is open
  const [featuresFor, setFeaturesFor] = useState(null); // tenant whose feature switches are open
  const [cleanFor, setCleanFor] = useState(null); // tenant being cleaned of dummy data
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "mira-home");
  const [navOpen, setNavOpen] = useState(false);
  const [platformLogo, setPlatformLogo] = useState("");
  useEffect(() => {
    api.get("/public/site-info").then((r) => setPlatformLogo(r.data.platform_logo || "")).catch(() => {});
  }, []);
  const [notifFeed, setNotifFeed] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [trialFilter, setTrialFilter] = useState("all");
  const [vertFilter, setVertFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    slug: "", name: "", owner_email: "", owner_name: "", owner_password: "",
    location: "", phone: "", salon_email: "", owner_phone: "", plan: "starter", trial_months: null, logo_url: "",
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
    setForm({ slug: "", name: "", owner_email: "", owner_name: "", location: "", phone: "", salon_email: "", owner_phone: "", plan: "starter", business_type: "salon" });
    setOpen(true);
  }

  function convertLead(inq) {
    const slug = inq.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    setForm({ slug, name: `${inq.name}'s Salon`, owner_email: inq.email, owner_name: inq.name, location: "", phone: inq.phone, salon_email: inq.email, owner_phone: inq.phone, plan: "starter", business_type: "salon" });
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
      // Optional fields: empty strings would fail Pydantic (EmailStr etc.) — drop them.
      for (const k of ["salon_email", "owner_phone", "phone", "location", "logo_url"]) if (!payload[k]) delete payload[k];
      const { data } = await api.post("/super-admin/tenants", payload);
      const trialUntil = data?.trial_end_date ? new Date(data.trial_end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
      if (data?.linked_existing_owner) {
        toast.success(`'${form.slug}' created & tagged to ${data.owner_email} — this owner now has ${data.owner_salon_count} salons on one login${trialUntil ? ` · free trial until ${trialUntil}` : ""}`, { duration: 8000 });
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
          trial_end_date: data.trial_end_date,
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
    askConfirm({
      title: `Re-onboard ${t.name}?`, message: "The salon comes back with all its old data, gets a 7-day grace period, and a fresh owner password is generated and emailed.", confirmLabel: "Re-onboard",
      action: async () => {
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
      },
    });
  }

  async function deleteTenant(t) {
    askConfirm({
      title: `Cancel subscription for ${t.name}?`, message: "Their account will be disabled (data kept — reversible via Reactivate).", confirmLabel: "Cancel subscription", danger: true,
      action: async () => {
        try { await api.delete(`/super-admin/tenants/${t.id}`); toast.success("Tenant cancelled"); load(); }
        catch (err) { toast.error("Delete failed"); }
      },
    });
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
    askConfirm({
      title: `Add SMS points for ${t.name}`, message: `Current balance: ${t.sms_points || 0}. 1 point = 1 customer SMS (booking confirmations, billing receipts, 24h reminders).`,
      confirmLabel: "Add points", inputLabel: "Points to add", defaultValue: "100",
      action: async (val) => {
        const points = parseInt(val, 10);
        if (!points || points < 1) { toast.error("Enter a positive number of points"); return; }
        try {
          const { data } = await api.post(`/super-admin/tenants/${t.id}/sms-points`, { points });
          toast.success(`${t.name} now has ${data.sms_points} SMS points`);
          load();
        } catch (e) { toast.error(e.response?.data?.detail || "Couldn't credit SMS points"); }
      },
    });
  }

  function publicBookingUrl(slug) {
    return `${window.location.origin}/book/${slug}`;
  }

  const trialMatch = (t) =>
    trialFilter === "all" ||
    (trialFilter === "newbiz90" && t.trial_kind === "newbiz90") ||
    (trialFilter === "trial7" && t.trial_kind === "trial7") ||
    (trialFilter === "trial30" && t.trial_kind === "trial30") ||
    (trialFilter === "trial_long" && t.trial_kind === "trial_long") ||
    (trialFilter === "paid" && t.status === "active") ||
    (trialFilter === "referred" && !!t.referred_by_name);

  const filteredTenants = tenants.filter(t =>
    (statusFilter === "all" || t.status === statusFilter) &&
    (vertFilter === "all" || (t.business_type || "salon") === vertFilter) &&
    trialMatch(t));

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-sky-50/70 to-violet-100/60 text-slate-800" data-testid="super-admin-page">
      <Super3DBackdrop />
      {/* Header */}
      <header className="border-b border-indigo-900/40 bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-950 sticky top-0 z-40 shadow-lg shadow-indigo-950/20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="relative w-11 h-11 sm:w-14 sm:h-14 shrink-0 rounded-full bg-[#0f0f14] flex items-center justify-center ring-1 ring-amber-300/70 shadow-[0_0_0_4px_rgba(212,175,55,0.12),0_10px_28px_-6px_rgba(212,175,55,0.55)]" data-testid="hq-logo-wrap">
              <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(240,217,165,0.35),transparent_60%)]" />
              <img src={platformLogo || "/assets/brand/ms-ring-160.png"} alt="Miracurl Suite" className={`relative w-9 h-9 sm:w-11 sm:h-11 drop-shadow-[0_2px_8px_rgba(212,175,55,0.6)] ${platformLogo ? "rounded-full object-cover" : "object-contain"}`} draggable="false" data-testid="hq-logo" />
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" title="Systems online" />
            </div>
            <div className="min-w-0">
              <div className="font-playfair text-base sm:text-xl flex items-center gap-2 whitespace-nowrap">
                <span className="gold-shine-text tracking-[0.12em] font-semibold">MIRACURL</span><span className="text-amber-100/80 tracking-[0.3em] text-xs sm:text-sm">HQ</span>
                <span data-testid="super-admin-badge" className="super-badge hidden sm:inline-flex items-center gap-1 text-[9px] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-full text-slate-900 whitespace-nowrap">
                  <Sparkles className="w-3 h-3" /> Super Admin
                </span>
              </div>
              <div className="text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.25em] uppercase text-amber-300/80 truncate">Command Console · AI-Powered</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden md:block"><NetSpeedIndicator /></div>
            <SuperNotifBell tenants={tenants} hqUnread={hqUnread} onGoInbox={() => setTab("inbox")}
              onGoTenant={(id) => { setTab("tenants"); setStatusFilter("all"); setVertFilter("all"); setTrialFilter("all"); setTimeout(() => document.querySelector(`[data-testid="tenant-row-${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150); }} />
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
              { id: "growth-advisory", label: "Growth Advisory", icon: TrendingUp },
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
            billing: <div className="space-y-6"><HqTaxCard /><MessageCreditsCard tenants={tenants} /><StripePaymentsPanel /><BillingPanel tenants={tenants} /></div>,
            partners: <PartnersPanel />,
            leaderboard: <LeaderboardPanel />,
            "growth-advisory": <GrowthAdvisoryPanel />,
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
                <WhatsAppLeadsCard />
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
            promo: <div className="space-y-6"><PromoVideoStudio /></div>,
            brandkit: <BrandKitPanel />,
            posters: <PromoImageStudio />,
            "verify-staff": <VerifiedStaffPanel />,
            team: <MiracurlTeamPanel />,
            website: <SiteInfoPanel />,
            deployments: <DeploymentHistoryPanel />,
            load: <PlatformLoadPanel />,
            database: <DatabasePanel />,
            security: <div className="space-y-6"><SuperAdminProfileCard /><SecurityCard /></div>,
          };
          return panels[tab];
        })() || (
          <>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4" data-testid="tenants-header">
          <div className="min-w-0">
            <h1 className="font-playfair text-3xl">Tenants</h1>
            <p className="text-slate-500 text-sm mt-1">Manage every salon &amp; restaurant on the Miracurl platform.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap lg:justify-end" data-testid="tenants-toolbar">
            <button
              data-testid="super-weekly-report-btn"
              onClick={sendWeeklyReports}
              disabled={sendingWeekly}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-slate-200 bg-white/80 text-slate-700 text-xs font-semibold hover:border-sky-400 hover:text-sky-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              title="Email last week's business snapshot to every active salon owner"
            >
              <Send className="w-3.5 h-3.5 text-sky-500" /> {sendingWeekly ? "Sending…" : "Weekly snapshots"}
            </button>
            <button
              data-testid="super-monthly-report-btn"
              onClick={sendMonthlyReports}
              disabled={sendingReports}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-slate-200 bg-white/80 text-slate-700 text-xs font-semibold hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              title="Email last month's business report to every active salon owner"
            >
              <Send className="w-3.5 h-3.5 text-emerald-500" /> {sendingReports ? "Sending…" : "Monthly reports"}
            </button>
            <button
              data-testid="copy-newbiz-link-btn"
              onClick={async () => {
                const link = `${window.location.origin}/signup-salon?offer=newbiz`;
                try { await navigator.clipboard.writeText(link); }
                catch {
                  const ta = document.createElement("textarea");
                  ta.value = link;
                  document.body.appendChild(ta);
                  ta.select();
                  try { document.execCommand("copy"); } catch { /* last resort below */ }
                  document.body.removeChild(ta);
                }
                toast.success("90-day invite link copied 🎁 — anyone signing up with it gets a FREE 90-day setup");
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors whitespace-nowrap"
              title={offerStats ? `90-day invite link — ${offerStats.opens} opens · ${offerStats.signups} signups · ${offerStats.assist_requests} assist requests` : "Copy the special signup link that grants a 90-day free trial"}
            >
              <Gift className="w-3.5 h-3.5" /> 90-day invite link
              {offerStats && (
                <span data-testid="newbiz-offer-stats" className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700/80 border-l border-amber-300 pl-2">
                  {offerStats.opens}<span className="font-normal opacity-70">opens</span>
                  <span className="opacity-40">·</span>{offerStats.signups}<span className="font-normal opacity-70">signups</span>
                  {offerStats.assist_requests > 0 && <><span className="opacity-40">·</span>{offerStats.assist_requests}<span className="font-normal opacity-70">assist</span></>}
                </span>
              )}
            </button>
            <TenantExportButtons />
            <button data-testid="super-new-tenant-btn" onClick={startNew} className="btn-blue !h-9 !py-0 !px-4 !rounded-full text-xs inline-flex items-center gap-1.5 whitespace-nowrap">
              <Plus className="w-3.5 h-3.5" /> New Tenant
            </button>
          </div>
        </div>

        <ReferralsPanel />

        <AssistQueueCard />

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

        {/* Filters — grouped segments */}
        <div className="card-light !p-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-0 md:divide-x md:divide-slate-200" data-testid="tenant-filters">
          <div className="flex items-center gap-1.5 flex-wrap md:pr-4" data-testid="tenant-status-filters">
            <span className="label-light !text-[9px] mr-1">Status</span>
            {["all", "active", "trial", "cancelled", "suspended"].map(s => (
              <button key={s} data-testid={`filter-${s}`} onClick={() => setStatusFilter(s)}
                className={`text-[11px] px-3 py-1 rounded-full border capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                {s === "all" ? `All ${tenants.length}` : `${s} ${tenants.filter(t => t.status === s).length}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap md:px-4">
            <span className="label-light !text-[9px] mr-1">Type</span>
            {[["all", "All"], ["salon", "💇 Salons"], ["restaurant", "🍽️ Restaurants"]].map(([v, l]) => (
              <button key={v} data-testid={`vertical-filter-${v}`} onClick={() => setVertFilter(v)}
                className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
                  vertFilter === v
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-white border-slate-200 text-slate-500 hover:border-amber-400"}`}>
                {l}{v !== "all" && ` ${tenants.filter(t => (t.business_type || "salon") === v).length}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap md:pl-4">
            <span className="label-light !text-[9px] mr-1">Plan</span>
            {[["all", "All"],
              ["newbiz90", "🌱 New-Biz 90d"],
              ["trial7", "7-day"],
              ["trial30", "30-day"], ["trial_long", "🎁 Extended"],
              ["paid", "💳 Paid"],
              ["referred", "🤝 Referred"]].map(([v, l]) => (
              <button key={v} data-testid={`trial-filter-${v}`} onClick={() => setTrialFilter(v)}
                className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
                  trialFilter === v
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-white border-slate-200 text-slate-500 hover:border-emerald-400"}`}>
                {l}{v !== "all" && ` ${tenants.filter(t =>
                  (v === "paid" && t.status === "active") ||
                  (v === "referred" && !!t.referred_by_name) ||
                  t.trial_kind === v).length}`}
              </button>
            ))}
          </div>
          {(statusFilter !== "all" || vertFilter !== "all" || trialFilter !== "all") && (
            <div className="md:pl-4 md:ml-auto flex items-center gap-2 text-[11px] text-slate-400 whitespace-nowrap">
              <span data-testid="tenant-filter-count">{filteredTenants.length} of {tenants.length}</span>
              <button data-testid="tenant-filter-clear" onClick={() => { setStatusFilter("all"); setVertFilter("all"); setTrialFilter("all"); }}
                className="text-slate-500 underline-offset-2 hover:underline">Clear</button>
            </div>
          )}
        </div>

        {/* Tenant list — readable cards */}
        <div className="space-y-3">
          {filteredTenants.map(t => (
            <div key={t.id} data-testid={`tenant-row-${t.id}`} className="card-light !p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setQuickFor(t)} data-testid={`tenant-quick-view-${t.id}`} title="Quick view — profile, plan timeline & recent activity" className="font-playfair font-semibold text-base truncate max-w-[340px] text-left hover:text-[#b08d3f] hover:underline decoration-[#d4af37]/60 underline-offset-4 transition-colors">{t.name}</button>
                    {t.inbox_ok === false && (
                      <span data-testid={`inbox-health-${t.id}`} title="No real notification email on file — owner won't receive reports, reminders or password-reset links. Ask them to add one in Settings → Notification email." className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 cursor-help">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> No inbox
                      </span>
                    )}
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${PLAN_BADGE[t.plan] || ''}`}>{t.plan}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
                    {t.business_type === "restaurant" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">🍽️ Restaurant</span>
                    )}
                    {t.currency && t.currency !== "INR" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200" title={`International salon — pays in ${t.currency} via Stripe`}>🌍 {t.currency}</span>
                    )}
                    {t.trial_kind === "newbiz90" && (
                      <span data-testid={`trial-kind-${t.id}`} title={`New-business — FREE 90-day setup trial${t.opening_date ? ` · opened/opening ${t.opening_date}` : ""}`} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300">🌱 New-Biz 90d{t.opening_date ? ` · 📅 ${t.opening_date}` : ""}</span>
                    )}
                    {t.trial_kind === "trial7" && (
                      <span data-testid={`trial-kind-${t.id}`} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200">{t.trial_span_label || "7-day"} trial</span>
                    )}
                    {t.trial_kind === "trial30" && (
                      <span data-testid={`trial-kind-${t.id}`} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{t.trial_span_label || "30-day"} trial</span>
                    )}
                    {t.trial_kind === "trial_long" && (
                      <span data-testid={`trial-kind-${t.id}`} title={`Extended free trial · ${t.trial_span_days} days in total`} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">🎁 {t.trial_span_label} free trial</span>
                    )}
                    {t.status === "trial" && Number.isFinite(t.trial_days_left) && (
                      <span data-testid={`trial-days-left-${t.id}`} title={`Trial ends ${String(t.trial_end_date || t.trial_ends_at || "").slice(0, 10)}`}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.trial_days_left <= 5 ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                        ⏳ {t.trial_days_left}d left
                      </span>
                    )}
                    {t.referred_by_name && (
                      <span data-testid={`referred-by-${t.id}`} title={`Referred by ${t.referred_by_name} — referrer becomes eligible for referral reward (trial extension / 20% commission) once this tenant activates or pays`}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200">🤝 via {t.referred_by_name}</span>
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
                  <div className="flex items-center gap-0.5 border border-slate-200 bg-slate-50/60 rounded-xl px-1.5 py-1" data-testid={`tenant-actions-${t.id}`}>
                    <ActionBtn testid={`open-salon-${t.id}`} onClick={() => { setActAsSalon(t.slug, t.name); nav("/dashboard"); }} title="Open this tenant's workspace (edit & correct — no deletes)" tone="text-violet-600 hover:bg-violet-50" icon={Eye} label="Open" />
                    <ActionBtn testid={`edit-tenant-${t.id}`} onClick={() => setEditFor(t)} title="Edit details, credentials & branch links" tone="text-emerald-600 hover:bg-emerald-50" icon={Pencil} label="Edit" />
                    <ActionBtn testid={`features-tenant-${t.id}`} onClick={() => setFeaturesFor(t)} title="Switch SMS / WhatsApp / Campaign on or off for this tenant" tone="text-[#9b3a4e] hover:bg-rose-50" icon={ToggleRight} label="Features" />
                    <ActionBtn testid={`tenant-profile-pdf-${t.id}`} onClick={() => profilePdf(t)} title="Account Profile PDF — HQ + tenant logo, owner & business details, trial and plan dates" tone="text-amber-600 hover:bg-amber-50" icon={IdCard} label="Profile" />
                    <ActionBtn testid={`pay-link-${t.id}`} onClick={() => setPayLinkFor(t)} title="Generate a subscription pay link — tenant pays, plan activates" tone="text-amber-600 hover:bg-amber-50" icon={CreditCard} label="Pay link" />
                    <ActionBtn testid={`import-customers-${t.id}`} onClick={() => setImportFor(t)} title="Import customers from CSV" tone="text-sky-600 hover:bg-sky-50" icon={Upload} label="Import" />
                    <ActionBtn testid={`diagnose-tenant-${t.id}`} onClick={() => setDiagFor(t)} title="Diagnose — find why this tenant feels slow & clear their cache" tone="text-sky-600 hover:bg-sky-50" icon={Stethoscope} label="Diagnose" />
                    <ActionBtn testid={`clean-dummy-${t.id}`} onClick={() => setCleanFor(t)} title="Clean test data — removes test/dummy bookings, customers & TEST staff" tone="text-rose-500 hover:bg-rose-50" icon={Eraser} label="Clean" />
                    <StatusActionButton t={t} setStatus={setStatus} reactivateTenant={reactivateTenant} />
                    <span className="w-px h-6 bg-slate-200 mx-1" />
                    <ActionBtn testid={`delete-tenant-${t.id}`} onClick={() => deleteTenant(t)} title="Cancel subscription (data kept)" tone="text-slate-400 hover:text-red-500 hover:bg-red-50" icon={Trash2} label="Cancel" />
                    <ActionBtn testid={`permanent-delete-tenant-${t.id}`} onClick={() => permanentDeleteTenant(t)} title="Permanently delete — erases all data, irreversible" tone="text-slate-400 hover:text-white hover:bg-red-600" icon={Trash2} label="Erase" strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {tenants.length === 0 && <div className="card-light text-center text-slate-500 py-12">No tenants yet. Add your first salon!</div>}
          {tenants.length > 0 && filteredTenants.length === 0 && (
            <div className="card-light text-center text-slate-500 py-10" data-testid="tenants-empty-state">
              <p className="font-medium">No tenants match the selected filters</p>
              <p className="text-xs text-slate-400 mt-1">
                You have {statusFilter !== "all" && `status “${statusFilter}”`} {vertFilter !== "all" && ` + type “${vertFilter}s”`} {trialFilter !== "all" && ` + plan “${trialFilter}”`} combined — no single tenant matches all of them.
              </p>
              <button data-testid="clear-tenant-filters-btn"
                onClick={() => { setStatusFilter("all"); setVertFilter("all"); setTrialFilter("all"); }}
                className="mt-4 px-5 py-2 rounded-full bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700">
                Clear all filters
              </button>
            </div>
          )}
        </div>

        <RewardsCampaignCard />
              <RewardsCampaignCard campaign="restaurant" />
        <SmsCreditLog />
          </>
        )}
        </div>
        </div>
      </main>

      {open && <OnboardTenantModal form={form} setForm={setForm} onSave={save} busy={busy} onClose={() => setOpen(false)} />}

      {importFor && (
        <ImportCustomersModal
          tenant={importFor}
          onClose={() => setImportFor(null)}
          onDone={load}
        />
      )}

      {payLinkFor && <PayLinkModal tenant={payLinkFor} onClose={() => setPayLinkFor(null)} />}

      {smsLogFor && <SmsLogModal tenant={smsLogFor} onClose={() => setSmsLogFor(null)} />}
      {featuresFor && <TenantFeaturesModal tenant={featuresFor} onClose={() => setFeaturesFor(null)} />}

      <TenantQuickView tenant={quickFor} onClose={() => setQuickFor(null)} onProfilePdf={profilePdf} />
      {editFor && (
        <EditTenantModal
          tenant={editFor}
          onClose={() => setEditFor(null)}
          onSaved={async () => { setEditFor(null); await load(); }} onRefresh={load}
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
          {creds.trial_end_date && (
            <div data-testid="creds-trial-info" className="mt-2 text-xs rounded-lg px-3 py-2 border bg-sky-50 border-sky-200 text-sky-800">
              🎁 Free trial active until <b>{new Date(creds.trial_end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</b> — the ₹0 invoice &amp; Congratulations email are being prepared and will land in a minute.
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

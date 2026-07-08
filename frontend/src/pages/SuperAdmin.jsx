import { useEffect, useState, useCallback } from "react";
import log from "@/lib/log";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Building2, Plus, LogOut, X, Crown, ExternalLink, Trash2, Upload, Receipt, Gift, Trophy, Bell, Send, TrendingUp, Download, IndianRupee, Sparkles, Eye, Inbox, Wrench, Users, Pencil } from "lucide-react";
import { toast } from "sonner";
import ImportCustomersModal from "./ImportCustomersModal";
import BillingPanel from "./BillingPanel";
import { SmsCreditLog } from "@/components/superadmin/SmsCreditLog";
import { PartnersPanel } from "@/components/superadmin/PartnersPanel";
import { EditTenantModal } from "@/components/superadmin/EditTenantModal";
import { Handshake } from "lucide-react";
import { setActAsSalon } from "@/lib/api";
import { SuperProfileCard, HealthBadge, AiInsightsPanel, RenewalNudge, HqInbox } from "@/components/SuperAdminExtras";
import EngineerPanel from "@/components/EngineerPanel";
import { LeaderboardPanel, RevenuePanel } from "@/components/superadmin/LeaderboardRevenue";
import { OnboardingStudio } from "@/components/superadmin/OnboardingStudio";
import { SuperNotifBell, StatusActionButton } from "@/components/superadmin/SuperNotifBell";
import { InquiriesPanel } from "@/components/superadmin/InquiriesPanel";

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
  const [importFor, setImportFor] = useState(null); // tenant being imported into
  const [tab, setTab] = useState("tenants"); // tenants | billing
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    slug: "", name: "", owner_email: "", owner_name: "", owner_password: "",
    location: "", phone: "", salon_email: "", owner_phone: "", plan: "starter",
  });

  const load = useCallback(async () => {
    const [o, t, hq, inq] = await Promise.all([
      api.get("/super-admin/overview"),
      api.get("/super-admin/tenants"),
      api.get("/super-admin/hq-messages").catch(() => ({ data: { unread: 0 } })),
      api.get("/super-admin/inquiries").catch(() => ({ data: { new_count: 0 } })),
    ]);
    setOverview(o.data);
    setTenants(t.data);
    setHqUnread(hq.data.unread || 0);
    setInquiryNew(inq.data.new_count || 0);
  }, []);
  useEffect(() => { load(); }, [load]);

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
    if (!window.confirm(`Cancel subscription for ${t.name}? Their account will be disabled.`)) return;
    try { await api.delete(`/super-admin/tenants/${t.id}`); toast.success("Tenant cancelled"); load(); }
    catch (err) { toast.error("Delete failed"); }
  }

  async function creditSms(t) {
    const val = window.prompt(`Add SMS points for ${t.name} (current balance: ${t.sms_points || 0})\n1 point = 1 billing SMS`, "100");
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/70 to-violet-100/60 text-slate-800" data-testid="super-admin-page">
      {/* Header */}
      <header className="border-b border-indigo-900/40 bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-950 sticky top-0 z-40 shadow-lg shadow-indigo-950/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Crown className="w-5 h-5 text-slate-900" />
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" title="Systems online" />
            </div>
            <div>
              <div className="font-playfair text-xl text-white flex items-center gap-2">
                Miracurl HQ
                <span data-testid="super-admin-badge" className="super-badge inline-flex items-center gap-1 text-[9px] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-full text-slate-900">
                  <Sparkles className="w-3 h-3" /> Super Admin
                </span>
              </div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-amber-300/80">Command Console · AI-Powered</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SuperNotifBell tenants={tenants} hqUnread={hqUnread} onGoInbox={() => setTab("inbox")} />
            <span className="text-xs text-white/50 hidden sm:inline">{user?.email}</span>
            <button data-testid="super-logout-btn" onClick={async () => { await logout(); nav("/login"); }} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition">
              <LogOut className="w-3 h-3" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-6 pb-24">
        {/* Super-admin profile */}
        <SuperProfileCard />

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            data-testid="super-tab-tenants"
            onClick={() => setTab("tenants")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === "tenants" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >Tenants</button>
          <button
            data-testid="super-tab-billing"
            onClick={() => setTab("billing")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "billing" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Receipt className="w-4 h-4" /> Billing & Subscriptions</button>
          <button
            data-testid="super-tab-partners"
            onClick={() => setTab("partners")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "partners" ? "border-emerald-500 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Handshake className="w-4 h-4" /> Partners</button>
          <button
            data-testid="super-tab-leaderboard"
            onClick={() => setTab("leaderboard")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "leaderboard" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Trophy className="w-4 h-4" /> Top Referrers</button>
          <button
            data-testid="super-tab-revenue"
            onClick={() => setTab("revenue")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "revenue" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><TrendingUp className="w-4 h-4" /> Revenue</button>
          <button
            data-testid="super-tab-ai"
            onClick={() => setTab("ai")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "ai" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Sparkles className="w-4 h-4" /> AI Insights</button>
          <button
            data-testid="super-tab-inquiries"
            onClick={() => setTab("inquiries")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "inquiries" ? "border-rose-500 text-rose-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Users className="w-4 h-4" /> Inquiries
            {inquiryNew > 0 && <span data-testid="inquiries-new-badge" className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold inline-flex items-center justify-center">{inquiryNew}</span>}
          </button>
          <button
            data-testid="super-tab-inbox"
            onClick={() => setTab("inbox")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "inbox" ? "border-violet-500 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Inbox className="w-4 h-4" /> HQ Inbox
            {hqUnread > 0 && <span data-testid="hq-unread-badge" className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold inline-flex items-center justify-center">{hqUnread}</span>}
          </button>
          <button
            data-testid="super-tab-engineer"
            onClick={() => setTab("engineer")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "engineer" ? "border-emerald-500 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Wrench className="w-4 h-4" /> AI Engineer</button>
          <button
            data-testid="super-tab-onboarding"
            onClick={() => setTab("onboarding")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "onboarding" ? "border-fuchsia-500 text-fuchsia-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Sparkles className="w-4 h-4" /> Onboarding Image</button>
        </div>

        {(() => {
          const panels = {
            billing: <BillingPanel tenants={tenants} />,
            partners: <PartnersPanel />,
            leaderboard: <LeaderboardPanel />,
            revenue: <RevenuePanel />,
            ai: <AiInsightsPanel />,
            inbox: <HqInbox onUnreadChange={setHqUnread} />,
            inquiries: <InquiriesPanel onNewCount={setInquiryNew} onConvert={convertLead} />,
            engineer: <EngineerPanel />,
            onboarding: <OnboardingStudio tenants={tenants} />,
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

        {/* Tenant list */}
        <div className="card-light p-0 overflow-hidden">
          <table className="luxe-table-light">
            <thead><tr><th>Salon</th><th>Slug</th><th>Owner</th><th>Plan</th><th>Status</th><th>Health</th><th>SMS</th><th>Booking Link</th><th></th></tr></thead>
            <tbody>
              {filteredTenants.map(t => (
                <tr key={t.id} data-testid={`tenant-row-${t.id}`}>
                  <td>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[10px] text-slate-400">{t.location || "—"}</div>
                  </td>
                  <td className="font-mono text-xs text-sky-600">{t.slug}</td>
                  <td className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span>{t.owner_email}</span>
                      {(t.owner_salon_count || 1) > 1 && (
                        <span data-testid={`salon-count-${t.id}`} title={`This owner email manages ${t.owner_salon_count} salons`}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200">
                          ×{t.owner_salon_count} salons
                        </span>
                      )}
                    </div>
                    {t.salon_email && t.salon_email !== t.owner_email && (
                      <div className="text-[10px] text-slate-400">salon: {t.salon_email}</div>
                    )}
                  </td>
                  <td>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${PLAN_BADGE[t.plan] || ''}`}>{t.plan}</span>
                  </td>
                  <td>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
                  </td>
                  <td><HealthBadge t={t} /><RenewalNudge t={t} /></td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span data-testid={`sms-balance-${t.id}`} className={`text-xs font-bold ${(t.sms_points || 0) < 20 ? "text-amber-600" : "text-emerald-700"}`}>{t.sms_points || 0}</span>
                      <button data-testid={`sms-points-${t.id}`} onClick={() => creditSms(t)} title="Credit SMS points"
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition">+ Add</button>
                    </div>
                  </td>
                  <td>
                    <a href={publicBookingUrl(t.slug)} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline flex items-center gap-1" data-testid={`booking-link-${t.id}`}>
                      <ExternalLink className="w-3 h-3" /> /book/{t.slug}
                    </a>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      <button data-testid={`open-salon-${t.id}`} onClick={() => { setActAsSalon(t.slug, t.name); nav("/dashboard"); }} title="Open salon workspace (edit & correct — no deletes)" className="p-1.5 text-violet-600 hover:bg-violet-50 rounded"><Eye className="w-3.5 h-3.5" /></button>
                      <button data-testid={`edit-tenant-${t.id}`} onClick={() => setEditFor(t)} title="Edit salon details, credentials & branch links" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      <button data-testid={`import-customers-${t.id}`} onClick={() => setImportFor(t)} title="Import customers" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Upload className="w-3.5 h-3.5" /></button>
                      <StatusActionButton t={t} setStatus={setStatus} reactivateTenant={reactivateTenant} />
                      <button data-testid={`delete-tenant-${t.id}`} onClick={() => deleteTenant(t)} title="Cancel subscription" className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && <tr><td colSpan="9" className="text-center text-slate-500 py-12">No tenants yet. Add your first salon!</td></tr>}
              {tenants.length > 0 && filteredTenants.length === 0 && <tr><td colSpan="9" className="text-center text-slate-400 py-10">No {statusFilter} salons.</td></tr>}
            </tbody>
          </table>
        </div>

        <SmsCreditLog />
          </>
        )}
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

      {editFor && (
        <EditTenantModal
          tenant={editFor}
          onClose={() => setEditFor(null)}
          onSaved={async () => { setEditFor(null); await load(); }}
        />
      )}

      {createdCreds && (
        <TempPasswordShareModal
          creds={createdCreds}
          onClose={() => setCreatedCreds(null)}
        />
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
